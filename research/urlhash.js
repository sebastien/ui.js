export class URLHash {
	static Separators = {
		entry: "&",
		value: "=",
		key: ":",
		item: "+",
	};
	static Keys = {
		default: "path",
		extra: "extra",
	};

	constructor(sep = URLHash.Separators, keys = URLHash.Keys) {
		this.sep = sep;
		this.keys = keys;
	}

	serialize(value, level = 0) {
		return value === undefined
			? ""
			: value === null
			? "null"
			: value === true
			? "true"
			: value === false
			? "false"
			: typeof value === "number"
			? `${value}`
			: typeof value === "string"
			? encodeURI(value)
			: value instanceof Array
			? this.serializeList(value, level)
			: value instanceof Object
			? this.serializeObject(value, level)
			: "";
	}

	serializeList(value, level = 0) {
		const sep = level ? this.sep.item : this.sep.entry;
		const res = value.map((_) => this.serialize(_, level + 1)).join(sep);
		return level ? `(${res})` : res;
	}

	serializeObject(value, level = 0) {
		const itemSep = level ? this.sep.item : this.sep.entry;
		const keySep = level ? this.sep.key : this.sep.value;
		const res = Object.keys(value)
			.map((k) => {
				const v = this.serialize(value[k], level + 1);
				return level == 0 && k == this.keys.default
					? v
					: `${k}${keySep}${v}`;
			})
			.join(itemSep);
		return level ? `(${res})` : res;
	}

	parseGroups(text) {
		const n = text.length;
		let current = { start: 0 };
		const roots = [current];
		const stack = [];
		let i = 0;
		while (i < n) {
			const c = text.charAt(i);
			if (c === "(") {
				const w = { start: i + 1 };
				if (stack.length === 0) {
					current.end = i - 1;
					current.text = text.substring(current.start, current.end);
					current = w;
					roots.push(current);
					stack.push(current);
				} else {
					current.children = current.children ? current.children : [];
					current.children.push(w);
					current = w;
					stack.push(current);
				}
			} else if (c === ")") {
				current.end = i;
				current.text = text.substring(current.start, current.end);
				current = stack.pop();
				if (stack.length === 0) {
					current.end = i;
					current.text = text.substring(current.start, current.end);
					current = { start: i + 1 };
					roots.push(current);
				}
			}
			i++;
		}
		const last = roots.at(-1);
		if (last.text === undefined) {
			last.end = n;
			last.text = text.substring(last.start, last.end);
		}
		return roots;
	}
	parse(text, level = 0) {
		let res = undefined;
		let key = undefined;
		const stack = [];

		let o = 0;
		let i = 0;
		const n = text.length;
		// FIXME: This algorithm is off, it does not support nested groups
		while (i < n) {
			const c = text.charAt(i);
			if (c === this.sep.value && level === 0) {
				// ENTRY=VALUE
				res = res ? res : {};
				key = text.substring(o, i);
				o = i + 1;
			} else if (c === this.sep.entry && level === 0) {
				// ENTRY&ENTRY
				res = res ? res : {};
				res[key || this.keys.default] = this.parse(
					text.substring(o, i),
					level + 1
				);
				key = undefined;
				o = i + 1;
			} else if (c === "(" && level > 0) {
				// ( --> Start of a group
				stack.push([key, res]);
				res = undefined;
				o = i + 1;
			} else if (c === ")" && level > 0) {
				// ) --> End of a group
				res = stack.at(-1)[1];
				// TODO: What about the key?
				stack.pop();
				o = i + 1;
			} else if (c === this.sep.item && level > 0) {
				// ITEM+ITEM
				res = res ? res : [];
				res.push(this.parse(text.substring(o, i), level + 1));
				o = i + 1;
			} else if (c === this.sep.key && level > 0) {
				// KEY:VALUE
				res = res ? res : {};
				key = text.substring(o, i);
				// TODO: We should indicate that the next item is expected to be assigned
				o = i + 1;
			}
			i += 1;
		}
		if (o < n) {
			const t = text.substring(o);
			const v =
				t === "null"
					? null
					: t === "true"
					? true
					: t === "false"
					? false
					: /^\d+(\.\d+)?$/.test(t)
					? parseFloat(t)
					: t;
			if (res) {
				if (res instanceof Array) {
					res.push(v);
				} else {
					res[key || this.keys.default] = v;
				}
			} else {
				return t;
			}
		} else {
			return res;
		}
	}
}

//console.log("XXX", new URLHash().parse("a&asdasds&conv=1+2+3+4&asdsadsa=34"));
window.URLHash = URLHash;
// EOF
