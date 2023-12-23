import {
	parse,
	makematch,
	seq,
	capture,
	text,
	or,
	opt,
	not,
	list,
} from "../utils/reparser.js";
import { Formats } from "../formats.js";
import { map, values, reduce } from "../utils/collections.js";
import { Selector, SelectorInput } from "../selector.js";
import { onError } from "../utils/logging.js";

// ----------------------------------------------------------------------------
// DSL
// ----------------------------------------------------------------------------

// --
// A *path* represents a selection in the data path, it has an optional
// `prefix` and then the `path` itself. Prefix can be:
// - `@` for component local scope
// - `/` for global scope
// - `.` for the current value
// - No prefix means it's selecting from the current scope.
//
// The path is list of names/indices, like `user.0.name`.
const PATH = or(
	seq(
		opt(capture("[@/_\\.]", "type")),
		list("([a-zA-Z_0-9]+|#)", text("."), "chunk", 0, 7),
		// FIXME: Not sure what the card is for
		opt(capture(text("*"), "card"))
	),
	capture(text("#"), "isKey"),
	capture(text("."), "isCurrent")
);

const CODE = seq(text("{"), capture("[^\\}]+", "code"), text("}"));
const EXPR = seq(text("("), capture("[^\\)]+", "expr"), text(")"));
const FORMAT = seq(text("|"), or(capture("[a-zA-Z_0-9]+", "formatter"), CODE));

const TARGET = seq(capture("[a-zA-Z_0-9]+", "target"), text("="));
const SELECTION = seq(
	or(EXPR, CODE, PATH),
	opt(list(FORMAT, "", "format", 0, 5))
);

const INPUT = seq(opt(capture("[a-zA-Z]+", "key"), text("=")), SELECTION);
const PROCESSOR = seq(text("->{"), capture(".+", "processor"), text("}"), "$");
const SELECTOR = seq(
	opt(TARGET),
	list(INPUT, ",", "inputs", 0, 7),
	opt(PROCESSOR)
);

// ---------------------------------------------------------------------------- HIGH LEVEL API
// ----------------------------------------------------------------------------

export const parseDirective = (text) => {
	console.log(parse(text));
};

const RE_SELECTOR = new RegExp(SELECTOR);
export const matchSelector = (text) =>
	RE_SELECTOR.exec(text)[0]?.length === text.length;

const normInput = (value) => (value === "#" ? "key" : value);

export const parseSelector = (text) => {
	const parsed = parse(text, RE_SELECTOR, true);
	if (!parsed || parsed.index !== 0) {
		onError("Could not parse selector at all", { text });
		return null;
	}
	const match = parsed && parsed.index === 0 ? makematch(parsed) : null;
	if (!match) {
		onError("Could not extract match from parsed data", { parsed });
		return null;
	}
	const length = parsed[0]?.length || 0;
	const expected = (text || "").length;
	if (!parsed || !match || length !== expected) {
		onError("Selector could not be parsed entirely", {
			text,
			parsed,
			match,
			length,
			expected,
		});
	}
	const formats = reduce(
		match.inputs,
		(r, { format }) =>
			reduce(
				format,
				(r, { code, formatter }) => {
					if (formatter) {
						const f = Formats[formatter];
						if (!f) {
							onError("Unknown formatter in selector", {
								formatter,
								selector: text,
							});
						} else {
							r.push(f);
						}
					} else if (code) {
						const f = new Function(
							"value",
							"scope",
							`const _=value;return (${code})`
						);
						// This is for when printing selectors
						f.name = code;
						r.push(f);
					}
					return r;
				},
				r
			),
		[]
	);

	// TODO: Support code and expr in selector input
	const inputs = map(
		values(match.inputs),
		(_, i) =>
			new SelectorInput(
				_.isCurrent ? "." : _.isKey ? "#" : _.type,
				_.isCurrent ? ["_"] : _.isKey ? ["#"] : values(_.chunk),
				_.card === "*",
				formats[i]
			)
	);
	return new Selector(
		// Inputs
		inputs,
		// Format
		match.processor
			? new Function(
					...inputs
						.map((v) => normInput(v.path.at(-1)))
						.concat([
							"$",
							`const _=${normInput(
								inputs[0].path.at(-1)
							)};return (${match.processor})`,
						])
			  )
			: null,
		// Target
		match.target
	);
};

const RE_NUMBER = new RegExp("^\\d+(\\.\\d+)?$");
const matchLiteral = (text) => {
	const v = text;
	const s = v.at(0);
	const e = v.length > 1 ? v.at(-1) : null;
	return (
		v === "true" ||
		v === "false" ||
		v === "undefined" ||
		v === "null" ||
		(s === e && (s === "'" || s === '"' || s === "`")) ||
		(s === "(" && e === ")") ||
		(s === "{" && e === "}") ||
		(s === "[" && e === "]") ||
		RE_NUMBER.test(text)
	);
};

// A literal can be directly converted to JavaScript and does not use
export const parseLiteral = (text) => {
	return text &&
		((text.startsWith("[") && text.endsWith("]")) ||
			(text.startsWith("{") && text.endsWith("}")))
		? JSON.parse(text.slice(1, -1))
		: text && text.startsWith("(") && text.endsWith(")")
		? new Function(`{return ${text}}`)()
		: text &&
		  ((text.startsWith("'") && text.endsWith("'")) ||
				(text.startsWith('"') && text.endsWith('"')))
		? text.substring(1, text.length - 1)
		: RE_NUMBER.test(text)
		? parseFloat(text)
		: text === "true"
		? true
		: text === "false"
		? false
		: text
		? text
		: undefined;
};

// An expression makes use of the context
export const parseExpression = (text) => {
	return text && text.startsWith("{") && text.endsWith("}")
		? text.slice(1, -1)
		: null;
};

// NOTE: While this is nice to write, this produces horrendously big
// expressions, which certainly create large objects, and therefore load
const RE_ON = new RegExp(
	or(
		seq(
			// Slot is like, "asdsasd=" or "slot!=" to force an assignment
			opt(
				seq(
					capture("[A-Za-z_0-9]+", "assign"),
					opt(capture(text("!"), "force")),
					text("=")
				)
			),
			opt(
				// FIXME: Don't agree with that, it should be:
				// expanded=expanded|not
				// expanded=expanded->(!_)
				// There's an optional input a,b,c->
				opt(
					list(or("[a-zA-Z]+", text("#")), ",", "inputs", 0, 7),
					"->"
				),
				// With an expression like `{....}`
				seq(
					text("{"),
					capture(not(or(text("}!"), "}$"), ".+"), "handler"),
					text("}")
				)
			),
			opt(
				// The event itself
				seq(
					text("!"),
					capture("[A-Za-z]+", "event"),
					opt(capture(text("."), "stops"))
				),
				// And a event processor
				opt(
					text("|"),
					opt(
						list(
							or("[a-zA-Z]+", text("#"), 0, 5),
							",",
							"eventInputs"
						),
						"->"
					),
					text("{"),
					capture(not("}$", ".+"), "eventProcessor"),
					text("}")
				)
			),
			"$"
		),
		seq(capture("[A-Za-z_0-9]+", "slot"))
	)
);
export const parseOnDirective = (value) => {
	const match = parse(value, RE_ON, true);
	if (!match) {
		onError("Could not parse this 'on' directive", { directive: value });
		return null;
	} else if (match.index !== 0 || match[0].length !== value.length) {
		onError("Could not fully parse this 'on' directive", {
			matched: value.substring(0, match[0].length),
			unrecognized: value.substring(match[0].length),
			directive: value,
		});
		return null;
	} else {
		const res = makematch(match);
		return res;
	}
};

export const parseForDirective = (text) => {
	const res = parseSelector(text);
	if (res) {
		if (res.inputs.length !== 1) {
			onError(
				`For directive expects just one selection, got ${res.inputs.length}`
			);
		}
	}
	// It's a for directive, so it's always going to be many
	res.isMany = true;
	return res;
};

export const parseOutDirective = (text) => {
	// TODO: Should support template
	return { selector: parseSelector(text), template: null };
};

export const extractLiteralBindings = (node, blacklist) =>
	extractBindings(node, blacklist, false);

// TODO: This is used to get the bindings in <slot binding=expr>, which
// is also used in components.
export const extractBindings = (node, blacklist, withSelectors = true) => {
	// We extract the bindings from the attributes
	const bindings = {};
	// TODO: That should be unified with the directives
	for (const attr of node.attributes || []) {
		if (blacklist && blacklist.indexOf(attr.name) !== -1) {
			continue;
		}
		// HTML attributes can't do camelCase.
		const name = attr.name
			.split(":")
			.at(-1)
			.split("-")
			.map((v, i) =>
				i === 0 ? v : `${v.charAt(0).toUpperCase()}${v.substring(1)}`
			)
			.join("");

		const v = attr.value;
		if (!v.trim()) {
			// Bindings will be inherited from scope
			bindings[name] = undefined;
		} else if (matchLiteral(v)) {
			// This is a literal expression
			bindings[name] = parseLiteral(v);
		} else if (withSelectors && matchSelector(v)) {
			bindings[name] = parseSelector(v);
		} else {
			// Otherwise it's a string
			bindings[name] = v;
		}
	}
	return bindings;
};
// EOF
