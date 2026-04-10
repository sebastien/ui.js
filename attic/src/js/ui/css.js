import { numfmt } from "./utils/text.js";
import { idem } from "./utils/func.js";
import { Color } from "./color.js";

// --
// ## CSS

export const CSS_UNITS = [
	"%",
	"em",
	"ex",
	"cap",
	"ch",
	"ic",
	"rem",
	"lh",
	"rlh",
	"vw",
	"vh",
	"vi",
	"vb",
	"vmin",
	"vmax",
	"cm",
	"mm",
	"Q",
	"in",
	"pc",
	"pt",
	"px",
	"deg",
	"rad",
	"grad",
	"turn",
	"s",
	"mm",
	"Hz",
	"kHz",
	"fr",
	"dpi",
	"dpcm",
	"dppx",
	"x",
].reduce((r, v) => {
	r[v] = true;
	return r;
}, {});

const RE_PROPERTY =
	/^((?<kebab>(--)?[a-z]+(-[a-z]+)*)|(?<pascal>[a-z]+([A-Z][a-z]+)*))$/;

// --
// Normalize the given name to be a CSS property name, typically
// by taking a `camelCase` and returning a `kebab-case`.
export const propertyName = (name) => {
	if (name && name.startsWith("--")) {
		return name;
	} else {
		const property = /[A-Za-z][a-z]*/g;
		const res = [];
		let match = null;
		while ((match = property.exec(name)) !== null) {
			res.push(match[0].toLowerCase());
		}
		return res.join("-");
	}
};

// -- doc
// Takes a `kebab-case` name and returns a `camelCase` version.
export const unpropertyName = (name) =>
	name.indexOf("-") >= 0
		? name
				.split("-")
				.map((v, i) =>
					i === 0
						? v.toLowerCase()
						: `${v.at(0).toUpperCase()}${v
								.substring(1)
								.toLowerCase()}`
				)
				.join("")
		: name;

const RE_PROPERY_TEMPLATE = new RegExp(
	"\\$((?<token>[\\w_]+(\\.[\\w_]+)*)|{(?<expr>[^}]+)})",
	"g"
);

// -- doc
// Expands the property `value` as a string, where any expression
// like `$token.name` or `${...}` is passed to the `parser` function.
export const expandProperty = (value, parser = undefined) => {
	if (value instanceof Color) {
		return value.hex;
	} else if (value instanceof Array) {
		// To support `fontFamily:["Karla", "sans-serif"]`
		value = value
			.map((_) => (_.indexOf(" ") !== -1 ? `"${_}"` : _))
			.join(", ");
	} else if (value instanceof Object) {
		return Object.entries(value).reduce(
			(r, [k, v]) => (
				(r[typeof v === "string" ? propertyName(k) : k] =
					expandProperty(v, parser)),
				r
			),
			{}
		);
	}
	const res = [];
	let match = null;
	let offset = 0;
	while ((match = RE_PROPERY_TEMPLATE.exec(value)) !== null) {
		// We push the inbetween text
		res.push(value.substring(offset, match.index));
		// We parse the token and push the result
		res.push(
			(parser || idem)(
				match.groups.token || match.groups.expr,
				match.groups.expr ? true : false
			)
		);
		offset = match.index + match[0].length;
	}
	if (offset === 0) {
		return value;
	} else {
		res.push(value.substring(offset, value.length));
		return res.join("");
	}
};

export const rules = (rules, parser = undefined) =>
	Object.entries(expandProperty(rules, parser)).reduce(
		(r, [k, v]) => (
			k.match(RE_PROPERTY)
				? (r["&"][propertyName(k)] = expandProperty(v))
				: (r[k] = v),
			r
		),
		{ "&": {} }
	);

export const css = (rule) => {
	const res = [];

	return res.join("\n");
};

// TODO: We should probably not do that

// We register the stylesheet if it's not there already.

export const stylesheet = (rules) => {
	const res = [];
	const node = document.createElement("style");
	for (let selector in rules) {
		const body = Object.entries(rules[selector])
			.reduce((r, [k, v]) => (r.push(`${k}:${v}`), r), [])
			.join(";");
		// FIXME: This may only work when the  Style node is registered.
		res.push(`${selector} {${body}}`);
		//Style.sheet.insertRule(`${selector} {${body}}`, 0);
	}
	// This works
	document.head.appendChild(node);
	node.innerHTML = res.join("\n");
	return node;
};

// -- doc
// Formats the given `value` with the given `unit` with the given
// `precision` (in decimals).
export const unit = (value, unit = "px", precision = 3) =>
	`${typeof value === "number" ? numfmt(value, precision) : value}${
		unit || "px"
	}`;

// EOF
