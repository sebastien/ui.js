export const make = (path, value, scope = undefined) => {
	const res = scope === undefined ? {} : scope;
	const p = path instanceof Array ? path : path.split("_");
	const n = p.length;
	let current = res;
	// This is where we do the insertion
	for (let i = 0; i < n; i++) {
		const k = p[i];
		if (i === n - 1) {
			current[k] = value;
		} else {
			current = current[k] =
				typeof current[k] === "object" ? current[k] : {};
		}
	}
	return res;
};

export const parse = (text, expr, raw = false) => {
	const regexp = expr instanceof RegExp ? expr : new RegExp(expr);
	const res = text.match(regexp);
	return raw
		? res
		: // Note that here we expect the match to start at 0. There may be a partial
		// match, though.
		res && res.index === 0
		? makematch(res)
		: undefined;
};

export const makematch = (match) =>
	Object.entries(match.groups || {}).reduce(
		(r, [k, v]) => (v === undefined ? r : make(k, v, r)),
		{}
	);

export const recapture = (element, name, group = "item", suffix = "_") =>
	element.replaceAll(
		new RegExp(`\\?\\<${group}${suffix}`, "g"),
		() => `?<${name}${suffix}`
	);

export const subcapture = (element, group = "item") =>
	element.replaceAll(new RegExp(`\\?\\<`, "g"), () => `?<${group}_`);

export const capture = (element, group = "item", start = undefined) =>
	`(?<${group}${start === undefined ? "" : `_${start}`}>${
		group === "item" ? element : recapture(element, group)
	})`;

export const text = (value) =>
	value.replaceAll(/[-+*()?<>\|\^\[\]\.\{\}\$]/g, (_) => "\\" + _);

export const next = (element, sep = ",", group = "item", start = 0) =>
	`${sep}${capture(element, group, start)}`;

export const list = (element, sep = ",", group = "item", start = 0, max = 16) =>
	array(max)
		.map((i) => {
			const item = subcapture(element, `${group}_${i}`);
			return i == 0
				? capture(item, group, i)
				: opt(next(item, sep, group, i));
		})
		.join("");

const array = (length) => {
	const res = new Array(length);
	for (let i = 0; i < length; i++) {
		res[i] = i;
	}
	return res;
};

export const opt = (...expr) => `(${expr.join("")})?`;
export const seq = (...args) => args.join("");
export const or = (...args) => `(${args.join("|")})`;
// `(?:` is non-capturing, `(?!` is negative look-ahead
export const not = (exclude, ...include) =>
	`(?:(?!${exclude})${include.join("")})`;

export const STRING_DQ = `"([^"]|\\")+"`;

export const STRING_SQ = `'([^']|\\')+'`;
export const STRING_RAW = "[^ \t]+";
export const NOT_SPACE = "[^ \\t]+";
export const NAME = "[a-zA-Z0-9\\-]+";
export const INDENT = "(\t*| *)";
export const SPACES = "[ ]+";
export const STRING = or(STRING_SQ, STRING_DQ, STRING_RAW);
