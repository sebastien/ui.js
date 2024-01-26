import { cmp } from "./utils/delta.js";
import { RuntimeError, NotImplementedError } from "./utils/errors.js";
import { Selector } from "./selector.js";
import { SelectorType } from "./selector.js";
import { map, last, access, patch } from "./utils/collections.js";
import { onError } from "./utils/logging.js";
import API from "./api.js";

// Wraps a subscription
export class Subscription {
	constructor(handler, path, origin) {
		this.handler = handler;
		this.path = path;
		this.origin = origin;
	}
	trigger(...value) {
		return this.handler(...value);
	}
}

// FIXME: It seems that there should be a simpler observable primitive, and
// then a more elaborate Decomposable that can be subscribed to at a granular
// basis. This needs to be investigated/elaborated.
// --
// A hierarchical set of subscription. A subscribable can wrap a given value
// and allow for the subscription of subsets of its values.
export class Subscribable {
	static Count = 0;
	constructor() {
		// Subscriptions is a tree of subscribed paths, where `Subscription` entries
		// are the actual subscriptions, and the string/int entries are
		// path keys.
		this.id = Subscribable.Count++;
		this._topics = null;
	}

	// FIXME: Not sure how useful this actually is.
	// --
	// Iterates over the topics available at the given `path`.
	*topics(path = null, offset = 0, creates = false) {
		if (!this._topics && creates) {
			this._topics = new Map();
		}
		let topic = this._topics;
		const n = topic && path ? path.length : 0;
		// For each element of the path, we try to retrieve the corresponding
		// Map

		if (offset === n) {
			yield topic;
		} else {
			for (let i = offset; i < n; i++) {
				const chunk = path[i];
				if (!topic.has(chunk)) {
					if (creates) {
						const s = new Map();
						topic.set(chunk, s);
						topic = s;
						yield s;
					} else {
						break;
					}
				} else {
					topic = topic.get(chunk);
					yield topic;
				}
			}
		}
	}

	topic(path = null, offset = 0, creates = false) {
		return last(this.topic(path, offset, creates));
	}

	sub(handler, path, offset = 0) {
		let topic = null;
		for (const _ of this.topics(path, offset, true)) {
			topic = _;
		}
		if (!topic) {
			throw RuntimeError();
		} else {
			const sub = new Subscription(handler, path, this);
			if (!topic.has(Subscription)) {
				topic.set(Subscription, [sub]);
			} else {
				topic.get(Subscription).push(sub);
			}
			return sub;
		}
	}

	unsub(sub, path = null, offset = 0) {
		if (!this._topics) {
			return null;
		}
		const topic = this.topic(path, offset, false);
		const subs = topic ? topic.get(Subscription) : null;
		if (subs) {
			const i = subs ? subs.indexOf(sub) : -1;
			return i >= 0 ? (subs.splice(i, 1), sub) : null;
		} else {
			return null;
		}
	}

	// --
	// Triggers a value change at the given `path[offset:]` (`null` by default).
	// This will notify all the subscribers of a potential change.
	trigger(value, path = null, offset = 0, bubbles = true) {
		// TODO: Support, path/offset, bubbles and then early exit.
		if (path !== null) {
			onError("Non=null path not supported yet");
		}
		return this._notifyTopics(value, this._topics);
	}

	_notifyTopics(value, topic = this._topics, depth = 0) {
		let count = 0;
		if (topic) {
			for (const [k, v] of topic.entries()) {
				if (k === Subscription) {
					for (const s of v) {
						// TODO: Support early exit
						s.trigger(value);
						count += 1;
					}
				} else {
					count += this._notifyTopics(
						value ? value[k] : undefined,
						v,
						depth + 1
					);
				}
			}
		}
		return count;
	}
}

export class Cell extends Subscribable {
	constructor(name) {
		super();
		this.name = name;
		// TODO: Should have revision
		//  TODO: Should have value getter
		//  TODO: Should have an internal mechanism to deal with Promises
	}

	get(path) {
		throw NotImplementedError();
	}
}

export class Value extends Cell {
	constructor(value, name, comparator = cmp) {
		super(name);
		this.value = undefined;
		this.comparator = comparator;
		// FIXME: Revision may be in a cell, actually
		this.revision = -1;
		this._pending = undefined;
		this.set(value);
	}

	set(value, path = null, offset = 0, force = false) {
		if (path) {
			throw NotImplementedError();
		}
		const previous = this.value;
		if (value instanceof Promise) {
			// We increment the revision number, to denote that we're waiting
			// on a result.
			this.join(value, () => {
				this.set(_);
			});
			return undefined;
		} else if (force || this.comparator(value, previous) !== 0) {
			// Once we have a result, we clear the pending value
			this.value = value;
			this._pending = null;
			this.revision += 1;
			this.trigger(value);
			return true;
		} else {
			// Event if the value was absorbed, we clear the pending value.
			this._pending = null;
			this.revision = this.revision < 0 ? 0 : this.revision;
			return false;
		}
	}

	get(path = null, offset = 0) {
		return access(this.value, path, offset);
	}

	put(path) {
		throw NotImplementedError();
	}

	patch(value, path = null, offset = 0, force = false) {
		if (value instanceof Promise) {
			this.revision += 1;
			this._pending = value;
			this.join(value, () => {
				this.patch(_, path, offset, force);
			});
			return undefined;
		} else {
			this._pending = null;
			this.revision = this.revision < 0 ? 0 : this.revision;
			console.log(
				"XXX PATCHING",
				this.value,
				path.slice(offset || 0),
				value
			);
		}
	}

	delete(path) {
		throw NotImplementedError();
	}

	// A utility method to join a value, but only if the revision is still the
	// same by the time it is resolved.
	join(value, callback) {
		const r = this.revision;
		const cell = this;
		const updater = (_) => {
			cell.revision === r &&
				(_ instanceof Promise
					? _.then(updater)
					: callback.apply(cell, [_]));
		};
		return value.then(updater);
	}
}

export class Selected extends Cell {
	constructor(selector, inputs, comparator = cmp) {
		super();
		this.inputs = inputs;
		this.selector = selector;
		this.comparator = comparator;
		this.subscriptions = new Array(inputs.length);
		this._value =
			selector.type === SelectorType.List
				? new Array(inputs.length)
				: selector.type === SelectorType.Map
				? {}
				: undefined;
	}
	get value() {
		return this._value;
	}
	bind() {
		const t = this.selector.type;
		for (let i; i < this.inputs.length; i++) {
			const input = this.inputs[i];
			if (input && input instanceof Cell) {
				const k =
					t === SelectorType.Atom
						? null
						: t === SelectorType.Mapping
						? this.selector.fields[i]
						: i;
				this.subscriptions[i] = input.sub(
					(...rest) => this.onInputUpdated(i, k, ...rest),
					this.selector.inputs[i].path,
					1
				);
			}
		}
	}
	unbind() {
		for (let i; i < this.inputs.length; i++) {
			const input = this.inputs[i];
			if (input && input instanceof Cell) {
				input.unsub(
					this.subscriptions[i],
					this.selector.inputs[i].path,
					1
				);
				this.subscriptions[i] = undefined;
			}
		}
	}
	onInputUpdated(index, key, value) {
		const v = this.selector.inputs[index].formatted(value);
		if (key === null) {
			if (this.comparator(v, this._value) !== 0) {
				// TODO: Should support promises
				this._value = v;
				this.trigger([], v);
			}
		} else {
			if (this.comparator(v, this._value[key]) !== 0) {
				// TODO: Should support promises
				this._value[key] = v;
				this.trigger([key], v);
			}
		}
	}

	eval() {
		const extracted = this.inputs.map((input, i) => {
			const sel = this.selector.inputs[i];
			return sel.formatted(
				access(input instanceof Cell ? input.value : input, sel.path, 1)
			);
		});
		switch (this.selector.type) {
			case SelectorType.Atom:
				return extracted[0];
			case SelectorType.List:
				return extracted;
			case SelectorType.Map: {
				const res = {};
				for (const i in extracted) {
					res[this.selector.fields[i]] = extracted[i];
				}
				return res;
			}
			default:
				onError("Unsupported type", {
					type: this.selector.type,
					selector: this.selector.toString(),
				});
		}
	}
}

export class Scope extends Cell {
	constructor(parent) {
		super();
		// Parent is either a scope, in which case the slots will
		// inherit form the parent, or an object, in which case its
		// values will be wrapped in cells.
		this.slots = parent
			? Object.create(
					parent instanceof Scope
						? parent.slots
						: map(parent, (_, k) => new Value(_, k))
			  )
			: {};
		this.parent = parent instanceof Scope ? parent : null;
	}

	get parents() {
		return [...this.ancestors()];
	}

	*ownSlots() {
		for (const k in this.slots) {
			if (this.slots.hasOwnProperty(k)) {
				yield k;
			}
		}
	}

	*ancestors() {
		let node = this;
		while (node.parent) {
			node = node.parent;
			yield node;
		}
	}

	define(slots, replace = true, skipDefined = false) {
		if (slots) {
			for (const k in slots) {
				// We retrieve the slot, and if the slot is a selector, then
				// we apply it and resolve the actuall cell that is attached to it.
				const w = slots[k];
				const v = w instanceof Selector ? this.select(w) : w;
				// We only define the own slots
				const slot = this.slots.hasOwnProperty(k)
					? this.slots[k]
					: undefined;
				// FIXME: This will  replace existing cells that are already
				// defined.
				if (replace || slot === undefined) {
					this.slots[k] = v instanceof Cell ? v : new Value(v, k);
				} else if (skipDefined && slot.revision >= -1) {
					// If we skip defined cells, then we won't override
					// and already defined value.
				} else if (slot instanceof Value) {
					// TODO: This may be a sub there?
					slot.set(v instanceof Cell ? v.get() : v);
				} else {
					if (v !== undefined) {
						onError(
							`Unsupported case for slot: trying to assign a value to slot ${k} which is not a Value cell`,
							{ slot, value: v }
						);
					} else {
						// All good here, it's undefined;
					}
				}
			}
		}
		return this;
	}

	defaults(slots) {
		return this.define(slots, false, true);
	}

	// Useful for debugging
	defined() {
		const res = {};
		for (const name in this.slots) {
			res[name] = this.get([name]);
		}
		return res;
	}

	// Useful for debugging
	declared(name = undefined) {
		if (name) {
			return (
				this.slots.hasOwnProperty(name)
					? [{ scope: this, value: this.get([name]) }]
					: []
			).concat(this.parent ? this.parent.declared(name) : []);
		} else {
			const res = {};
			for (const _ in this.slots) {
				res[_] = this.declared(_);
			}
			return res;
		}
	}

	// Useful for debugging
	scopes() {
		return [...this.ancestors()].map(_.slots);
	}

	get(path, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.get(path, offset + 1) : undefined;
	}

	// Updates and existing slot
	update(path, value, force = false) {
		return this.set(path, value, force, true);
	}

	// Ensures that there is a local slot defined, unless `update` is false.
	set(path, value, force = false, update = false) {
		if (typeof path === "string") {
			// NOTE: We do need to override. If we set in a scope, we don't
			// want to change a parent scope, unless update is true.
			const slot =
				update || this.slots.hasOwnProperty(path)
					? this.slots[path]
					: null;
			if (slot) {
				if (value instanceof Cell) {
					onError(
						"Scope.set: cannot assign a cell to an existing slot",
						{ path, slot, value }
					);
				} else {
					slot.set(value, undefined, undefined, force);
				}
			} else {
				this.slots[path] =
					value instanceof Cell ? value : new Value(value, path);
			}
		} else if (path.length == 1) {
			return this.set(path[0], value, force, update);
		} else {
			const slot =
				update || this.slots.hasOwnProperty(path[0])
					? this.slots[path[0]]
					: null;
			if (!slot) {
				// The slot doesn't exist yet, so we create a value nested at the subset
				// of the path. For instance if path is `items.children.1` then this
				// will create `{children:[undefined,<value>]}`.
				return this.set(
					path[0],
					patch(undefined, path, value, undefined, 1)
				);
			} else {
				return slot.patch(value, path, 1);
			}
		}
	}

	subscribed(path, creates = false, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.subscribed(path, creates, offset + 1) : undefined;
	}

	// FIXME: Is this even used? I think that in practice this may not be necessary
	// anymore as the Selected cell does the job. This is called in effectors.Effect.constructor
	sub(handler, path, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.sub(handler, path, offset + 1) : undefined;
	}

	unsub(sub, path, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.unsub(sub, path, offset + 1) : undefined;
	}

	trigger(path, bubbles, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.trigger(path, bubbles, offset + 1) : undefined;
	}

	dispose() {
		// NOTE: The problem is that the children may still use these
		// slots. They just won't be active anymore.
		for (const k of this.ownSlots) {
			this.slots[k].unbind();
			delete this.slots[k];
		}
	}

	// --
	// Returns a cell the represents the selected value. In the easy case,
	// where the selector has only one input and no transform, this returns
	// the select cell.
	select(selector) {
		if (!selector) {
			return null;
		}
		// This is the general case, where we select and potentially transform
		// one or more values.
		const inputs = selector.inputs.map((input) => {
			const key = input.path[0] || "_";
			return key === "#" ? this.key : this.slots[key];
		});
		if (
			selector.type === SelectorType.Atom &&
			inputs.length === 1 &&
			selector.inputs[0].path.length <= 1 &&
			!selector.inputs[0].format?.length
		) {
			return inputs[0];
		} else {
			const cell = new Selected(selector, inputs);
			// We'll need to make sure that there's an equivalent unbind
			cell.bind();
			return cell;
		}
	}

	eval(selector) {
		if (!selector) {
			return this.get("_");
		}
		if (selector.format) {
			const inputs = selector.inputs.map((_) =>
				_.formatted(this.get(_.path))
			);
			try {
				return selector.format(...[...inputs, API]);
			} catch (exception) {
				onError(`Selector formatter failed: ${selector.toString()}`, {
					input: inputs,
					selector,
					exception,
				});
				return null;
			}
		} else {
			switch (selector.type) {
				case SelectorType.Atom:
					return selector.inputs[0].formatted(
						this.get(selector.inputs[0].path)
					);
				case SelectorType.List:
					return selector.inputs.map((_) =>
						_.formatted(this.get(_.path))
					);
				case SelectorType.Map:
					return selector.inputs.reduce(
						(r, _) => (
							(r[_.name] = _.formatted(this.get(_.path))), r
						),
						{}
					);
				default:
					onError("Unsupported selector type", selector.type, {
						selector,
					});
					return null;
			}
		}
	}

	// TODO: Cell
}
// EOF
