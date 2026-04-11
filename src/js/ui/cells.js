import { onError } from "./utils/logging.js";

// TODO: That should probably be "reactive"
//
// --
// The context acts as a singleton to retrieve the current context, typically
// used for handlers.
export class Context {
	static Stack = [];
	static Get() {
		return Context.Stack.at(-1);
	}
	static Push(value) {
		Context.Stack.push(value);
		return true;
	}
	static Pop(value) {
		if (Context.Stack.at(-1) === value) {
			Context.Stack.pop();
			return true;
		} else {
			return false;
		}
	}
	// --
	// Clear the given `context` so that the given `id` and 5 next slots
	// are nullified. This matches the stride of 6 slots per Slot instance.
	static Clear(ctx, id) {
		ctx[id] = null;
		ctx[id + 1] = null;
		ctx[id + 2] = null;
		ctx[id + 3] = null;
		ctx[id + 4] = null;
		ctx[id + 5] = null;
	}
	static Run(context, functor, args) {
		// TODO: should really be contextual if multiple threads.
		Context.Push(context);
		try {
			return args ? functor(...args) : functor();
		} finally {
			Context.Pop(context);
		}
	}
}

// There's still question on the boundary between slot/cell/derivation, etc.
export class Slot {
	static Id = 0;

	// These are the offsets for slot data within each context entry.
	// Slot IDs use a stride of 6 starting at index 4.

	// Metadata keys at indices 0-3 (shared across all contexts).
	// By using small integers instead of strings, these values share the
	// V8 elements backing store with slot data, avoiding separate named
	// property overhead (~1.8 MB savings in large apps).
	static Input = 0; // Special context value for passing values
	static Owner = 1; // Offset for the owning slot/effect
	static Parent = 2; // Offset for the parent context
	static Name = 3; // Offset for a debug name

	// Per-slot offsets 0-5 (added to each slot's base id):
	static Observable = 1; // Offset of the observable value
	// FIXME: Not sure if revision is useful, especially as slots
	// can be replicated across contexts.
	static Revision = 2; // Offset of the revision number
	static Node = 3; // Offset of the node
	static State = 4; // Offset of the state
	static Render = 5; // Offset of the render data

	// --
	// Matches the given `template` against the given `data`, returning
	// a flat array of alternating [slot, value, slot, value, ...] pairs
	// where slot is the original slot of the template, and value is
	// either a slot or a regular value.
	static Match(template, data, context = undefined, res = []) {
		// `data` may be a slot, in which case we may need to resolve it.
		const resolved_data =
			data instanceof Slot
				? context
					? context[data.id]
					: undefined
				: data;
		if (template instanceof Slot) {
			if (template.input) {
				Slot.Match(template.input, resolved_data, context, res);
			}
			res.push(template, data);
		} else if (template instanceof Map) {
			const is_map = data instanceof Map;
			if (resolved_data !== null && resolved_data !== undefined) {
				for (const k of template.keys()) {
					const w = is_map ? resolved_data.get(k) : resolved_data[k];
					Slot.Match(template[k], w, context, res);
				}
			}
		} else if (template instanceof Object) {
			const is_map = resolved_data instanceof Map;
			if (resolved_data !== null && resolved_data !== undefined) {
				for (const k in template) {
					const w = is_map ? resolved_data.get(k) : resolved_data[k];
					Slot.Match(template[k], w, context, res);
				}
			}
		}
		return res;
	}

	// --
	// Walks the template, and replaces any Slot with its value from
	// the given context.
	static *Walk(template) {
		if (template instanceof Slot) {
			yield template;
		} else if (template instanceof Map) {
			for (const v of template.values()) {
				for (const _ of Slot.Walk(v)) {
					yield _;
				}
			}
		} else if (template instanceof Array) {
			for (let i = 0; i < template.length; i++) {
				for (const _ of Slot.Walk(template[i])) {
					yield _;
				}
			}
		} else if (Object.getPrototypeOf(template) === Object.prototype) {
			for (const k in template) {
				for (const _ of Slot.Walk(template[k])) {
					yield _;
				}
			}
		}
	}

	// --
	// Like Walk, but uses a callback instead of a generator for better
	// performance in hot paths.
	static Each(template, callback) {
		if (template instanceof Slot) {
			callback(template);
		} else if (template instanceof Map) {
			for (const v of template.values()) {
				Slot.Each(v, callback);
			}
		} else if (template instanceof Array) {
			for (let i = 0; i < template.length; i++) {
				Slot.Each(template[i], callback);
			}
		} else if (template && Object.getPrototypeOf(template) === Object.prototype) {
			for (const k in template) {
				Slot.Each(template[k], callback);
			}
		}
	}

	// --
	// Walks the template, and replaces any Slot with its value from
	// the given context.
	static Expand(template, context) {
		if (template instanceof Slot) {
			return context ? context[template.id] : undefined;
		} else if (template instanceof Map) {
			const res = new Map();
			for (const [k, v] of template.entries()) {
				res.set(k, Slot.Expand(v, context));
			}
		} else if (template instanceof Array) {
			return template.map((_) => Slot.Expand(_, context));
		} else if (Object.getPrototypeOf(template) === Object.prototype) {
			const res = {};
			for (const k in template) {
				res[k] = Slot.Expand(template[k], context);
			}
			return res;
		} else {
			return template;
		}
	}

	// --
	// Subscribes a handler to the given slot id in context.
	static Sub(context, id, handler) {
		const subs = context[id + Slot.Observable] || (context[id + Slot.Observable] = []);
		subs.push(handler);
		return true;
	}

	// --
	// Unsubscribes a handler from the given slot id in context.
	static Unsub(context, id, handler) {
		const subs = context[id + Slot.Observable];
		if (subs) {
			const i = subs.indexOf(handler);
			if (i >= 0) {
				subs.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	// --
	// Publishes a value to all subscribers of the given slot id in context.
	static Pub(context, id, value) {
		const subs = context[id + Slot.Observable];
		if (subs) {
			for (let i = 0; i < subs.length; i++) {
				if (subs[i](value) === false) {
					break;
				}
			}
		}
	}

	// --
	// Sets a value for the given slot id in context and notifies subscribers.
	static Notify(context, id, value, force) {
		if (force || value !== context[id]) {
			context[id] = value;
			context[id + Slot.Revision] = (context[id + Slot.Revision] || 0) + 1;
			const subs = context[id + Slot.Observable];
			if (subs) {
				for (let i = 0; i < subs.length; i++) {
					if (subs[i](value) === false) {
						break;
					}
				}
			}
		}
	}

	constructor() {
		// Slot IDs start at 4 (after metadata indices 0-3) and use a stride
		// of 6. Each slot reserves 6 entries in the context for:
		// +0 value, +1 observable, +2 revision, +3 node, +4 state, +5 render.
		this.id = 4 + Slot.Id++ * 6;
	}

	// --
	// Retrieves the slot value in the current context.
	get value() {
		return this.get();
	}
	set value(value) {
		this.set(value);
	}

	// --
	// Ensures the subscriber array for this slot is initialized in the context.
	// For hot paths, prefer using Slot.Sub/Unsub/Notify/Pub static methods
	// directly to avoid intermediate object allocation.
	observable(context = Context.Get()) {
		if (context) {
			// Ensure subscriber array is initialized in the context.
			if (!context[this.id + Slot.Observable]) {
				context[this.id + Slot.Observable] = [];
			}
			return context;
		}
		onError(
			"cells.Slot.observable",
			"No context specified, cannot retrieve observable"
		);
	}

	get() {
		const ctx = Context.Get();
		return ctx ? ctx[this.id] : undefined;
	}

	// --
	// We `force` by default
	set(value, force = true, context = Context.Get()) {
		if (context) {
			Slot.Notify(context, this.id, value, force);
		}
	}

	// ========================================================================
	// MANIPULATION API
	// ========================================================================

	at(index, value = undefined) {
		const i = typeof index === "string" ? parseInt(index) : index;
		if (value === undefined) {
			return this.list().at(i);
		} else if (isNaN(i)) {
			return this.get();
		} else {
			const v = this.list();
			while (v.length < i) {
				v.push(undefined);
			}
			v[i] = value;
			this.set(v, true);
			return v;
		}
	}

	append(item) {
		const v = this.list();
		v.push(item instanceof Slot ? item.get() : item);
		this.set(v, true);
	}

	remove(item) {
		const v = item instanceof Slot ? item.get() : item;
		const w = this.list();
		const i = w.indexOf(v);
		if (i !== -1) {
			w.splice(i, 1);
			this.set(w, true);
		}
		return w;
	}

	insert(index, item) {
		const v = item instanceof Slot ? item.get() : item;
		const w = this.list();
		while (w.length < index) {
			w.push(undefined);
		}
		w.splice(index, 0, v);
		this.set(w, true);
		return w;
	}

	toggle(value = undefined) {
		const v = this.get();
		const w =
			value === undefined
				? v
					? false
					: true
				: v === value
				? null
				: value;
		this.set(w);
		return w;
	}

	pop(index = undefined) {
		const w = this.list();
		if (w.length) {
			if (index === undefined) {
				w.pop();
			} else {
				w.splice(index, 1);
			}
			this.set(w, true);
		}
		return w;
	}

	// NOTE: This does not mutate
	list() {
		const v = this.get();
		return v instanceof Array ? v : [v];
	}

	dict(key = "_") {
		const v = this.get();
		return v === undefined || v === null
			? {}
			: Object.getPrototypeOf(v) === Object.prototype
			? v
			: { [key]: v };
	}
	map(key = "_") {
		const v = this.get();
		if (v instanceof Map) {
			return v;
		} else {
			const w = new Map();
			if (v !== undefined) {
				w.set(key, v);
			}
			return w;
		}
	}

	// --
	// Tells if the cell is of the given `type:int`.
	isa(type) {
		return this.id % type === 0;
	}

	toString() {
		//return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
		return `${this.constructor.name}(${this.id})`;
	}
}

// --
// An observable value that can be subscribed to and updated. This is now
// a thin wrapper around inline context storage for backward compatibility.
// Hot paths should use Slot.Sub/Unsub/Notify/Pub static methods directly.
export class Observable {
	//--
	//Observables wrap a value, and map it to a specific id within a context.
	constructor(value, context, id) {
		this.id = id;
		this.context = context;
		// Initialize the value in context
		if (value !== undefined) {
			context[id] = value;
		}
		// Ensure subscriber array exists
		if (!context[id + Slot.Observable]) {
			context[id + Slot.Observable] = [];
		}
	}

	get subs() {
		return this.context[this.id + Slot.Observable];
	}

	// --
	// Returns the value of this observable within the context.
	get value() {
		return this.context[this.id];
	}

	set value(value) {
		this.set(value);
	}

	get revision() {
		return this.context[this.id + Slot.Revision] || 0;
	}

	get() {
		return this.value;
	}

	set(value, force = undefined) {
		Slot.Notify(this.context, this.id, value, force);
	}

	pub(value) {
		Slot.Pub(this.context, this.id, value);
	}

	sub(handler) {
		return Slot.Sub(this.context, this.id, handler);
	}

	unsub(handler) {
		return Slot.Unsub(this.context, this.id, handler);
	}
}

// TODO: A Cell is an Observable with its own context.

// EOF
