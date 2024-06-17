export const Context = {};

const FIELD_SEP = String.fromCharCode(31);
Object.freeze(Context);

// TODO: Should be a slot maybe?
//
export class Slot {
	static Id = 0;

	// These are the offsets in for the identifiers. Ids are incremented
	// by a step of 10 and start at 10.
	static Parent = 0;
	static Input = 1;
	static Node = 2;
	static State = 3;
	static Render = 4;
	static Revision = 5;

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
		return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
	}
}

export class Cell extends Slot {
	constructor(value = undefined, name = undefined) {
		super();
		this.value = value;
		this.name = name;
	}
}
// EOF
