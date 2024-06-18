const FIELD_SEP = String.fromCharCode(31);

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
			return False;
		}
	}
	static Run(context, functor, args) {
		// TODO: should really be contextual if multiple threads.
		Context.Push(context);
		const res = functor(...args);
		Context.Pop(context);
		return res;
	}
}

// There's still question on the boundary between slot/cell/derivation, etc.
export class Slot {
	static Id = 0;

	// These are the offsets in for the identifiers. Ids are incremented
	// by a step of 10 and start at 10.
	static Parent = 1; // Offset for the parent context
	static Input = 2; // Offset of the input
	static Node = 3; // Offset of the node
	static State = 4; // Offset of the state
	static Render = 5; // Offset of the render data
	static Revision = 6; // Offset of the revision number
	static Sub = 7; // Offset of the pub/sub

	static Match(template, data, res = []) {
		if (template instanceof Slot) {
			if (template.input) {
				Slot.Match(template.input, data, res);
			}
			res.push([template, data]);
		} else if (template instanceof Map) {
			const is_map = data instanceof Map;
			if (data !== null && data !== undefined) {
				for (const k of template.keys()) {
					Slot.Match(
						template[k],
						is_map ? data.get(k) : data[k],
						res,
					);
				}
			}
		} else if (template instanceof Object) {
			const is_map = data instanceof Map;
			if (data !== null && data !== undefined) {
				for (const k in template) {
					Slot.Match(
						template[k],
						is_map ? data.get(k) : data[k],
						res,
					);
				}
			}
		}
		return res;
	}

	constructor() {
		// There's a bit of a trick with the way we manage ids. The first
		// 10 are reserved, and then we leave 9 identifiers that can be
		// used by each cell to store additional data in the context.
		this.id = (1 + Slot.Id++) * 10;
	}

	// --
	// Tells if the cell is of the given `type:int`.
	isa(type) {
		return this.id % type === 0;
	}

	toString() {
		//return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
		return `Slot(${this.id})`;
	}
}

// FIXME: Not sure what Cell is for
export class Cell extends Slot {
	constructor(value = undefined, name = undefined) {
		super();
		this.default = value;
		this.name = name;
	}
}
// EOF
