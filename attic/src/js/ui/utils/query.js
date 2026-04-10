import { len, filter } from "./collections.js";

class Combinator {
	constructor(...values) {
		this.values = values;
	}
}
class Or extends Combinator {}

class And extends Combinator {}

export const predicate = (criteria) => {
	criteria = filter(criteria, (_) => _ !== null && _ !== undefined);
	if (len(criteria) == 0) {
		return null;
	} else {
		return (_) => match(_, criteria);
	}
};

export const match = (value, criteria) => {
	if (!criteria) {
		return true;
	}
	for (const k in criteria) {
		const c = criteria[k];
		const v = value ? value[k] : undefined;
		if (c instanceof RegExp) {
			if (v == undefined) {
				return false;
			} else {
				const w = typeof v === "string" ? v : `${v}`;
				if (!c.test(w)) {
					return false;
				}
			}
		}
	}
	return true;
};

export const text = (text) =>
	text
		? new RegExp(
				`${text
					.trim()
					.split(/\s+OR\s+/i)
					.map((part) => {
						// Replace special characters with their escaped versions
						part = part
							.replace(/([\\.*+?^${}|/()[\]\\])/g, "\\$1")
							.replace(/\s*\?\s*/g, "(?:\\s+([^\\s]+))?");
						// Handle exact phrases with quotes
						return part.startsWith('"') && part.endsWith('"')
							? `\\b${part.slice(1, -1)}\\b`
							: part;
					})
					.join("|")}`,
				"i"
		  )
		: null;

const API = { text, predicate, match };
export default API;
// EOF
