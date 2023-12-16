import { cmp } from "./utils/delta.js";
import { RuntimeError, NotImplementedError } from "./utils/errors.js";
import { Selector } from "./selector.js";
import { SelectorType } from "./selector.js";
import {
	range,
	map,
	last,
	reduce,
	filter,
	len,
	access,
	append,
	removeAt,
	copy,
} from "./utils/collections.js";
import { lerp } from "./utils/math.js";
import { onError, setTrace } from "./utils/logging.js";

// This is mapped to `$` in formatters
export const API = {
	range,
	map,
	reduce,
	filter,
	len,
	lerp,
	copy,
	append,
	removeAt,
	setTrace,
};

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

// A hierarchical set of subscriptions
export class Subscribable {
	static Count = 0;
	constructor() {
		// Subscriptions is a tree of subscribed paths, where `Subscription` entries
		// are the actual subscriptions, and the string/int entries are
		// path keys.
		this.id = Subscribable.Count++;
		this._topics = null;
	}

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

	trigger(value, path = null, offset = 0, bubbles = true) {
		let count = 0;
		if (!this._topics) {
			return count;
		}
		if (bubbles) {
			const topics = [...this.topics(path, offset)];
			// We need to start with last one
			for (let i = topics.length - 1; i >= 0; i--) {
				const subs = topics[i].get(Subscription);
				if (subs) {
					for (const s of subs) {
						if (s.trigger(value) === false) {
							return count + 1;
						} else {
							count += 1;
						}
					}
				}
			}
		} else {
			// We only get the last one
			const topic = last(this.topics(path, offset, false));
			const subs = topic ? topic.get(Subscription) : null;
			if (subs) {
				for (const s of subs) {
					if (s.trigger(value) === false) {
						return count + 1;
					} else {
						count += 1;
					}
				}
			}
		}
		return count;
	}
}

export class Cell extends Subscribable {
	constructor() {
		super();
	}

	get(path) {
		throw NotImplementedError();
	}
}

export class Value extends Cell {
	constructor(value, comparator = cmp) {
		super();
		this.value = undefined;
		this.comparator = comparator;
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
			const r = this.revision;
			const cell = this;
			this._pending = value;
			const updater = (_) => {
				cell.revision === r &&
					(_ instanceof Promise ? _.then(updater) : cell.set(_));
			};
			value.then(updater);
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
			return false;
		}
	}

	get(path = null, offset = 0) {
		return access(this.value, path, offset);
	}

	put(path) {
		throw NotImplementedError();
	}

	patch(path) {
		throw NotImplementedError();
	}

	delete(path) {
		throw NotImplementedError();
	}
}

export class Reducer extends Cell {
	constructor(
		input,
		reducer = undefined,
		value = undefined,
		comparator = cmp
	) {
		super();
		this.input = input;
		this.reducer = reducer;
		// // TODO
		// this.subscribed =
		//   input instanceof Cell
		//     ? input.sub(this.update)
		//     : input
		//     ? map(input, (_, k) => _.sub(null, (_) => this.update(_, k)))
		//     : null;
		this.value = value;
		this.inputValue = undefined;
	}

	get(path = null, offset = 0) {
		if (this.revision === -1) {
			this.inputValue = this.evaluateInputs();
			this._set(this.evaluate(this.inputValue));
		}
		return access(this.value, path, offset);
	}

	unbind() {
		if (this.input instanceof Cell) {
			// this.subscribed && this.input.unsub(null, this.subscribed);
			console.log("FIXME");
		} else {
			console.log("FIXME");
			// each(this.input, (_, k) => this.input[k].unsub(null, _));
		}
	}

	update(value, k = null) {
		if (value instanceof Promise) {
			throw new Error(
				"Cannot update a cell with a future, value must be final",
				{ value, k }
			);
		} else {
			// TODO: We may want to compare the previous input value.
			this.inputValue = value;
			this._set(this.reducer ? this.reducer(value) : value);
		}
	}

	evaluateInputs() {
		throw NotImplementedError();
	}

	evaluate() {
		throw NotImplementedError();
	}
}

// --
// Reduces a single input argument
export class ValueReducer extends Reducer {
	evaluateInputs() {
		return this.input.get();
	}
	evaluate(value = this.evaluateInputs()) {
		return this.reducer(...value);
	}
}

// --
// Reduces an array of arguments
export class ListReducer extends Cell {
	constructor(input, reducer, value = undefined, cmp = undefined) {
		super(input, reducer, value, cmp);
		this.inputValue = map(input, (_) => _.get());
	}

	evaluateInputs() {
		return map(this.input, (_) => _.get());
	}

	evaluate(value = this.evaluateInputs()) {
		return this.reducer(...value);
	}

	update(value, k) {
		if (value instanceof Promise) {
			throw new Error(
				"Cannot update a cell with a future, value must be final",
				{ value, k }
			);
		} else {
			this.inputValue[k] = value;
			// TODO: Should we absorb changes at the input? Probably not.
			this._set(this.reducer(this.inputValue));
		}
	}
}

// --
// Reduces a map of arguments
export class MapReducer extends ListReducer {
	evaluate(value = this.evaluateInputs()) {
		return this.reducer(value);
	}
}

export class Scope extends Cell {
	constructor(parent) {
		super();
		this.slots = parent
			? Object.create(
					parent instanceof Scope
						? parent.slots
						: map(parent, (_) => new Value(_))
			  )
			: {};
		this.parent = parent instanceof Scope ? parent : null;
	}

	get parents() {
		return [...this.ancestors()];
	}

	*ancestors() {
		let node = this;
		while (node.parent) {
			node = node.parent;
			yield node;
		}
	}

	define(slots, replace = true) {
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
					this.slots[k] = v instanceof Cell ? v : new Value(v);
				} else if (slot && slot.get() === undefined) {
					// TODO: This may be a sub there?
					slot.set(v instanceof Cell ? v.get() : v);
				}
			}
		}
		return this;
	}

	// Useful for debugging
	all() {
		const res = {};
		for (const name in this.slots) {
			res[name] = this.get([name]);
		}
		return res;
	}

	// Useful for debugging
	defined(name = undefined) {
		if (name) {
			return (
				this.slots.hasOwnProperty(name)
					? [{ scope: this, value: this.get([name]) }]
					: []
			).concat(this.parent ? this.parent.defined(name) : []);
		} else {
			const res = {};
			for (const _ in this.slots) {
				res[_] = this.defined(_);
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

	set(path, value, force = false) {
		if (typeof path === "string") {
			const slot = this.slots[path];
			if (slot) {
				slot.set(value, undefined, undefined, force);
			} else {
				this.slots[path] = new Value(value);
			}
		} else {
			throw NotImplementedError();
		}
	}

	subscribed(path, creates = false, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.subscribed(path, creates, offset + 1) : undefined;
	}

	sub(handler, path, offset = 0) {
		path = typeof path === "string" ? path.split(".") : path;
		const slot = this.slots[path[offset]];
		return slot ? slot.sub(handler, path, offset + 1) : undefined;
	}

	// topics(path, offset = 0) {
	//   path = typeof path === "string" ? path.split(".") : path;
	//   const slot = this.slots[path[offset]];
	//   return slot ? slot.topics(path, offset + 1) : undefined;
	// }

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

	select(selector) {
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
