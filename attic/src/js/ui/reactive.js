import { cmp } from "./utils/delta.js";
import { asTrue } from "./utils/func.js";
import { RuntimeError, NotImplementedError } from "./utils/errors.js";
import { Reactor, Selector, SelectorType } from "./selector.js";
import { map, last, access, patch } from "./utils/collections.js";
import { onError } from "./utils/logging.js";
import API from "./api.js";

// Wraps a subscription
export class Subscription {
	constructor(handler, path, origin) {
		this.handler = handler;
		this.path = path;
		this.origin = origin;
		this.isActive = true;
	}
	disable() {
		return this.enable(false);
	}
	enable(value = true) {
		this.isActive = value;
		return this;
	}
	trigger(...value) {
		return this.isActive ? this.handler(...value) : undefined;
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
			if (topic) {
				yield topic;
			}
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
		return last(this.topics(path, offset, creates));
	}

	// FIXME: We should track subscriptions,
	sub(handler, path = null, offset = 0) {
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
				// We insert the handler ahead, it's always latest first
				// and oldest last.
				topic.get(Subscription).splice(0, 0, sub);
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
		if (path === null) {
			return this._notifyTopics(
				value,
				path === null ? this._topics : this.topic(path, offset),
			);
		} else {
			let topic = undefined;
			for (const t of this.topics(path, offset)) {
				if (topic) {
					// FIXME: We should extract the value, or maybe we say
					// undefined==no change?
					console.log("TODO: Notify topic with value");
					this._notifyTopics(undefined, topic);
				}
				topic = t;
			}
			this._notifyTopics(value, topic, -1);
		}
	}

	_notifyTopics(value, topic = this._topics, limit = -1, depth = 0) {
		let count = 0;
		if (topic) {
			for (const [k, v] of topic.entries()) {
				if (k === Subscription) {
					for (const s of v) {
						// TODO: Support early exit
						// TODO: What about the path
						s.trigger(value);
						count += 1;
					}
				} else if (limit < 0 || depth < limit) {
					count += this._notifyTopics(
						value ? value[k] : undefined,
						v,
						limit,
						depth + 1,
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

	get(path, offset) {
		throw NotImplementedError();
	}

	bind() {}
	unbind() {}
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
			this.revision += 1;
			this.join(value, (_) => {
				this.set(_);
			});
			return undefined;
		} else if (force || this.comparator(value, previous) !== 0) {
			// Once we have a result, we clear the pending value
			this.value = value;
			this._pending = null;
			this.revision += 1;
			this.trigger(value, path, offset);
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
			this.join(value, (_) => {
				this.patch(_, path, offset, force);
			});
			return undefined;
		} else {
			this._pending = null;
			this.revision = this.revision < 0 ? 0 : this.revision;
			const v = patch(this.value, path, value, undefined, offset);
			this.set(v, null, 0, true);
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

// TODO: We should have a Fused cells value here.
// export class Proxied extends Value {
// }

// Represents a source of events.
export class Signal extends Value {
	constructor(name) {
		super(undefined, name, asTrue);
	}

	set(value, path = null, offset = 0) {
		// We always force the set
		return super.set(value, path, offset, true);
	}
}

export class Selected extends Cell {
	constructor(selector, inputs, comparator = cmp) {
		super();
		this.inputs = inputs;
		this.selector = selector;
		this.comparator = comparator;
		this.subscriptions = new Array(inputs.length);
		this._value = undefined;
		// NOTE: We should optimize and use this to do incremental
		// updates.
		this._inputsValue =
			selector.type === SelectorType.List
				? new Array(inputs.length)
				: selector.type === SelectorType.Map
					? {}
					: undefined;
		this.revision = -1;
	}

	get value() {
		if (this.revision === -1) {
			const v = this.eval();
			// NOTE: this is a pattern that should be abstracted out.
			if (v instanceof Promise) {
				this.revision = 0;
				const revision = this.revision;
				const updater = (value) => {
					if (this.revision === revision) {
						this._value = value;
						this.revision += 1;
						this.trigger(value);
					}
				};
				v.then(updater);
			} else {
				this._value = v;
				this.revision = 0;
			}
		}
		return this._value instanceof Promise ? undefined : this._value;
	}

	get(path, offset = 0) {
		return access(this.value, path, offset);
	}

	bind() {
		const t = this.selector.type;
		for (let i = 0; i < this.inputs.length; i++) {
			const input = this.inputs[i];
			if (input && input instanceof Cell) {
				const k =
					t === SelectorType.Atom
						? null
						: t === SelectorType.Mapping
							? this.selector.fields[i]
							: i;
				// The input is going to be like `cell.property.…`
				const path = this.selector.inputs[i].path;
				this.subscriptions[i] = input.sub(
					(...rest) => this.onInputUpdated(i, k, ...rest),
					path,
					1,
				);
			}
		}
	}

	unbind() {
		for (let i = 0; i < this.inputs.length; i++) {
			const input = this.inputs[i];
			if (input && input instanceof Cell) {
				input.unsub(
					this.subscriptions[i],
					this.selector.inputs[i].path,
					1,
				);
				this.subscriptions[i] = undefined;
			}
		}
	}

	// Called as part of  each input cell's subscription handler, `index`
	// is the input number, `key` is either index (array) or the name (map),
	// `value` is the value replaced.
	onInputUpdated(index, key, value) {
		// TODO: We should optimize this
		if (value instanceof Promise) {
			onError("Input updated with promise not supported yet", {
				cell: this.id,
				name: this.name,
				index,
				key,
				value,
			});
		} else {
			if (value instanceof Promise) {
				value.then((_) => {
					if (
						this.selector.type === SelectorType.Atom
							? this._inputsValue === value
							: this._inputsValue[key] === value
					) {
						this.onInputUpdated(index, key, _);
					}
				});
			} else {
				let previous = undefined;
				if (this.selector.type === SelectorType.Atom) {
					previous = this._inputsValue;
					this._inputsValue = value;
				} else {
					previous = this._inputsValue[key];
					this._inputsValue[key] = value;
				}
				if (
					this.comparator(previous, value) !== 0 &&
					// The following is an edge case where a cell is initialized
					// with a future, and then set with an undefined value.
					!(previous instanceof Promise && value === undefined)
				) {
					const w = this.eval();
					if (w instanceof Promise && w != this._value) {
						const rev = this.revision;
						w.then((_) => {
							if (this.revision === rev) {
								this._value = _;
								this.revision += 1;
								this.trigger(_);
							}
						});
					} else if (this.comparator(previous, value) !== 0) {
						this._value = w;
						this.revision += 1;
						this.trigger(w);
					}
				}
			}
		}
	}

	eval() {
		const extracted = this.inputs.map((input, i) => {
			const sel = this.selector.inputs[i];
			return sel.formatted(
				access(
					input instanceof Cell ? input.value : input,
					sel.path,
					1,
				),
			);
		});
		let res = undefined;
		switch (this.selector.type) {
			case SelectorType.Atom:
				res = extracted[0];
				break;
			case SelectorType.List:
				res = extracted;
				break;
			case SelectorType.Map:
				{
					res = {};
					for (const i in extracted) {
						res[this.selector.fields[i]] = extracted[i];
					}
				}
				break;
			default:
				onError("Unsupported type", {
					type: this.selector.type,
					selector: this.selector.toString(),
				});
		}
		try {
			return this.selector.format
				? this.selector.type === SelectorType.List
					? this.selector.format(...res, API)
					: this.selector.format(res, API)
				: res;
		} catch (error) {
			onError("Scope.eval; Error during selector formatting", {
				text: this.selector.toString(),
				selector: this.selector,
				value: res,
				error,
			});
			return null;
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
						: map(parent, (_, k) => new Value(_, k)),
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

	// Defines/updates the slots in this scope based on the given `slots`.
	// When `replace` is true, any existing slot will be overridden, when
	// `skipDefined` is set only the slots that exist but have no value
	// will be set.
	define(slots, replace = true, skipDefined = false) {
		if (slots) {
			for (const k in slots) {
				// We retrieve the slot, and if the slot is a selector, then
				// we apply it and resolve the actual cell that is attached to it.
				const w = slots[k];
				// If the given value is a selector, then we create a selection
				// (ie a derived value).
				const v = w instanceof Selector ? this.select(w, k) : w;

				// We only define the own slots
				const slot = this.slots.hasOwnProperty(k)
					? this.slots[k]
					: undefined;

				// FIXME: This will  replace existing cells that are already
				// defined.
				if (replace || slot === undefined) {
					this.slots[k] = v instanceof Cell ? v : new Value(v, k);
					// If we had a previous scope cell, which is different from the assigned
					// value, we need to unbind it.
					if (w && w instanceof Cell && w !== v) {
						w.unbind();
					}
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
							{ slot, value: v },
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
					? [
							{
								scope: this,
								cell: this.slots[name],
								value: this.get([name]),
							},
						]
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

	patch(delta) {
		if (delta instanceof Object) {
			for (const k in delta) {
				this.set(k, delta[k], true, true);
			}
		}
	}

	// FIXME: Should probably be `value`, `path`.
	// Updates and existing slot
	update(path, value, force = false) {
		return this.set(path, value, force, true);
	}

	// Ensures that there is a local slot defined, unless `update` is false.
	// FIXME: update should be create and should be negated.
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
						{ path, slot, value },
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
					patch(undefined, path, value, undefined, 1),
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

	// TODO: This is the same a subscribable
	trigger(value, path = null, offset = 0, bubbles = true) {
		console.log("NOT IMPLEMENTED -- see XXXTrigger");
	}

	// FIXME: This is not the same as Subscribable
	XXXtrigger(path, bubbles, offset = 0) {
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

	// TODO: Not sure it's the best place.
	// --
	// Given a list of `Reactor` instances, binds the reactors to the
	// existing slots;
	reactions(reactors, scope = this) {
		return reactors.length > 0
			? reactors.reduce((r, reactor) => {
					const s = this.reaction(reactor, scope);
					if (!s) {
						return r;
					} else if (r === null) {
						return [s];
					} else {
						r.push(s);
						return r;
					}
				}, null)
			: null;
	}

	reaction(reactor, scope = this) {
		if (!reactor) {
			return null;
		} else if (reactor instanceof Reactor) {
			const name = reactor.name;
			if (!reactor.selector) {
				return null;
			}
			if (!this.slots[name]) {
				onError("Slot undefined, can't bind reactor", {
					name,
					reactor,
				});
				return null;
			}
			const s = this.slots[name].sub(() => {
				// NOTE: The reactions need to be evaluated in the scope
				// they were declared in, but will need to have the
				// event as well.
				const v = scope.eval(
					reactor.selector,
					true,
					// If the scope of the reaction is different,
					// we need to pre-fill overridden values.
					this !== scope
						? {
								[name]: this.slots[name].value,
								"#": this.key,
							}
						: null,
				);
				if (reactor.selector.target) {
					// NOTE: We use update here as we don't
					// want to create a new slot.
					scope.update(reactor.selector.target, v);
				}
				return v;
			});
			s.enable(false);
			return s;
		} else {
			onError("Expected Reactor, got", { value: reactor });
			return null;
		}
	}

	// --
	// Returns a cell the represents the selected value. In the easy case,
	// where the selector has only one input and no transform, this returns
	// the select cell.
	select(selector, name = undefined) {
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
			!selector.inputs[0].format?.length &&
			!selector.format
		) {
			// We only return the input as-is if it's a plain, no-transform
			// selector.
			return inputs[0];
		} else {
			const cell = new Selected(selector, inputs);
			if (name) {
				cell.name = name;
			}
			// We'll need to make sure that there's an equivalent unbind
			cell.bind();
			return cell;
		}
	}

	// --
	// A simple wrapper around `Scope.get()` that uses an override object
	// map, where values will be sourced first. This is useful in event
	// handlers where we need to surface the event and its key, without
	// clashing with the local scope. Conceptually, event handlers
	// act as dataflow bridges.
	evalInput(input, overrides = null) {
		const v = overrides ? overrides[input.path[0]] : undefined;
		return input.formatted(v === undefined ? this.get(input.path) : v);
	}

	eval(selector, _, overrides = null) {
		if (!selector) {
			return this.get("_");
		}

		if (selector.format) {
			const inputs = selector.inputs.map((_) =>
				this.evalInput(_, overrides),
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
					return this.evalInput(selector.inputs[0], overrides);
				case SelectorType.List:
					return selector.inputs.map((_) =>
						this.evalInput(_, overrides),
					);
				case SelectorType.Map:
					return selector.inputs.reduce(
						(r, _) => (
							(r[_.name] = this.evalInput(_, overrides)), r
						),
						{},
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
