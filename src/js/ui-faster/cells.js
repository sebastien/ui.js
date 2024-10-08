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
	// Clear the given `context` so that the given `id` and 9 next slots
	// are nullified.
	static Clear(ctx, id) {
		for (let i = 0; i < 10; i++) {
			const sid = id + i;
			if (!ctx.hasOwnProperty(i)) {
				ctx[sid] = null;
			}
		}
	}
	static Run(context, functor, args) {
		// TODO: should really be contextual if multiple threads.
		Context.Push(context);
		const res = args ? functor(...args) : functor();
		Context.Pop(context);
		return res;
	}
}

// There's still question on the boundary between slot/cell/derivation, etc.
export class Slot {
	static Id = 0;

	// These are the offsets in for the identifiers. Ids are incremented
	// by a step of 10 and start at 10.
	static Input = "input"; // Special context value for passing values
	static Owner = "owner"; // Offset for the parent context
	static Parent = "parent"; // Offset for the parent context
	static Name = "name"; // Offset for the parent context

	static Observable = 1; // Offset of the observable value
	// FIXME: Not sure if revision is useful, especially as slots
	// can be replicated across contexts.
	static Revision = 2; // Offset of the revision number
	static Node = 3; // Offset of the node
	static State = 4; // Offset of the state
	static Render = 5; // Offset of the render data

	// --
	// Matches the given `template` against the given `data`, returning
	// a list of tuples `[slot,value]` where slot is the original slot
	// of the template, and `value` is either a slot or a regular value.
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
			res.push([template, data]);
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

	constructor() {
		// There's a bit of a trick with the way we manage ids. The first
		// 10 are reserved, and then we leave 9 identifiers that can be
		// used by each cell to store additional data in the context.
		this.id = (1 + Slot.Id++) * 10;
	}

	// --
	// Retrieves the slot value in the current context.
	get value() {
		return this.get();
	}
	set value(value) {
		this.set(value);
	}

	observable(context = Context.Get()) {
		if (!context) {
			onError(
				"cells.Slot.observable",
				"No context specified, cannot retrieve observable"
			);
		} else {
			const i = this.id + Slot.Observable;
			if (!context[i]) {
				context[i] = new Observable(context[this.id], context, this.id);
			}
			return context[i];
		}
	}

	get() {
		const ctx = Context.Get();
		// TODO: I think there's an opportunity here to define how data
		// propagation work -- local reads, or remote reads, local writes
		// or remote writes.
		// --
		// We get in the observable if there is one. This means that if there
		// is an observable, the local context will be ignored.
		const obs = ctx[this.id + Slot.Observable];
		return obs ? obs.get() : ctx ? ctx[this.id] : undefined;
	}

	// --
	// We `force` by default
	set(value, force = true) {
		// TODO: We should check if it's read-only or not
		const ctx = Context.Get();
		if (ctx) {
			const obs = ctx[this.id + Slot.Observable];
			if (obs) {
				// We have an observable so set in observable
				obs && obs.set(value, force);
			} else {
				// There is no observable value, so we set in the local
				// context.
				ctx[this.id] = value;
			}
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
// An observable value that can be subscribed to and updated. Obsevables
// are used to wrap and share values that can change and operate within
// a given context.
export class Observable {
	//--
	//Observables wrap a value, and map it to a specific id within a context.
	constructor(value, context, id) {
		this.id = id;
		this.subs = undefined;
		this.context = context;
		this.revision = -1;
		if (value !== undefined) {
			this.set(value);
		}
	}

	// --
	// Returns the value of this observable within the context.
	get value() {
		return this.context[this.id];
	}

	set value(value) {
		this.set(value);
	}

	get() {
		return this.value;
	}

	set(value, force = undefined) {
		if (force || this.revision === -1 || value !== this.value) {
			// If the value changes, we updated the context, local value,
			// revision number and
			this.context[this.id] = value;
			this.revision++;
			this.pub(value);
		}
	}

	pub(value) {
		if (this.subs) {
			let count = 0;
			for (const handler of this.subs) {
				count += 1;
				// TODO: Should manage update cycles
				// TODO: Should catch exceptions
				if (handler(value, this) === false) {
					break;
				}
			}
			return count;
		} else {
			null;
		}
	}

	sub(handler) {
		const subs = (this.subs = this.subs ?? []);
		subs.push(handler);
		return true;
	}

	unsub(handler) {
		if (this.subs) {
			const i = this.subs.indexOf(handler);
			if (i >= 0) {
				this.subs.splice(i, 1);
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}
}

// TODO: A Cell is an Observable with its own context.

// EOF
