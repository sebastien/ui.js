export const Context = {};

const FIELD_SEP = String.fromCharCode(31);
Object.freeze(Context);

export class Cell {
	static Id = 0;

	static Parent = 0;
	static Input = 1;
	static Node = 2;
	static State = 3;
	static Render = 4;
	static Revision = 5;

	static Match(template, data, res = []) {
		if (template instanceof Cell) {
			if (template.input) {
				Cell.Match(template.input, data, res);
			}
			res.push([template, data]);
		} else if (template instanceof Map) {
			const is_map = data instanceof Map;
			if (data !== null && data !== undefined) {
				for (const k of template.keys()) {
					Cell.Match(
						template[k],
						is_map ? data.get(k) : data[k],
						res
					);
				}
			}
		} else if (template instanceof Object) {
			const is_map = data instanceof Map;
			if (data !== null && data !== undefined) {
				for (const k in template) {
					Cell.Match(
						template[k],
						is_map ? data.get(k) : data[k],
						res
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
		this.id = (1 + Cell.Id++) * 10;
	}

	applyContext(context, data) {
		return context;
	}

	render(node, position, context, effector) {
		effector.ensureContent(node, position, context[this.id]);
	}

	toString() {
		return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
	}
}

// EOF
