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
import API from "../api.js";
import { Formats } from "../formats.js";
import { map, values, reduce } from "../utils/collections.js";
import { Reactor, Fused, Selector, SelectorInput } from "../selector.js";
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

// ----------------------------------------------------------------------------
// HIGH LEVEL API
// ----------------------------------------------------------------------------

const RE_SELECTOR = new RegExp(SELECTOR);
export const matchSelector = (text) =>
	RE_SELECTOR.exec(text)[0]?.length === text.length;

const normInput = (value) => (value === "#" ? "key" : value);

// A wrapper to create function and report errors in case it fails.
export const createFunction = (args, body) => {
	try {
		return new Function(...args, body);
	} catch (error) {
		onError("Could not create function", { args, body, error });
		return null;
	}
};

export const parseSelector = (text, args = undefined) => {
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
		(r, { format }) => {
			r.push(
				reduce(
					format,
					(r, { code, formatter }, i) => {
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
							const f = createFunction(
								["value", "scope"],
								`const _=value;return (${code})`
							);
							if (f) {
								// This is for when printing selectors
								f.name = code;
								r.push(f);
							}
						}
						return r;
					},
					[]
				)
			);
			return r;
		},
		[]
	);

	// TODO: Support code and expr in selector input
	const inputs = [
		...(args ? args.map((_) => new SelectorInput(_.split("."))) : []),
		...map(
			values(match.inputs),
			(_, i) =>
				new SelectorInput(
					_.isCurrent ? "." : _.isKey ? "#" : _.type,
					_.isCurrent
						? ["_"]
						: _.isKey
						? ["#"]
						: [...values(_.chunk)],
					_.card === "*",
					formats[i]
				)
		),
	];

	return new Selector(
		// Inputs
		inputs,
		// Format
		match.processor
			? createFunction(
					[...inputs.map((v) => normInput(v.path.at(-1))), "$"],
					`const _=${normInput(inputs[0].path.at(-1))};return (${
						match.processor
					})`
			  )
			: null,
		// Target
		match.target
	);
};

const RE_NUMBER = new RegExp("^\\d+(\\.\\d+)?$");
const matchLiteralValue = (text) => {
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

// A literal selector is an inline expression that can be
// evaluated to a complete selector.
export const matchLiteralSelector = (text) =>
	text && text.startsWith("${") && text.endsWith("}");

export const parseLiteralSelector = (text) =>
	parseSelector(text.substring(2, text.length - 1));

// A literal can be directly converted to JavaScript and does not use
export const parseLiteralValue = (text) => {
	try {
		return text &&
			((text.startsWith("[") && text.endsWith("]")) ||
				(text.startsWith("{") && text.endsWith("}")))
			? JSON.parse(text)
			: text && text.startsWith("(") && text.endsWith(")")
			? createFunction(["$"], `{return ${text}}`)(API)
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
	} catch (error) {
		onError("Could not parse literal value", { text, error });
		return null;
	}
};

export const parseLiteral = (text) =>
	matchLiteralSelector(text)
		? parseLiteralSelector(text)
		: parseLiteralValue(text);

// An expression makes use of the context
export const parseExpression = (text) => {
	return text && text.startsWith("{") && text.endsWith("}")
		? text.slice(1, -1)
		: null;
};

const SLOT = "\\w+(\\.\\w+)*";
// NOTE: While this is nice to write, this produces horrendously big
// expressions, which certainly create large objects, and therefore load
const RE_ON = new RegExp(
	or(
		seq(
			// Slot is like, "asdsasd=" or "slot!=" to force an assignment
			opt(
				// We may need to assign to multiple slots
				capture(list(SLOT, ",", "assign", 0, 4)),
				opt(capture(text("!"), "force")),
				text("=")
			),
			opt(
				// FIXME: Don't agree with that, it should be:
				// expanded=expanded|not
				// expanded=expanded->(!_)
				// There's an optional input a,b,c->
				list(or(SLOT, text("#")), ",", "inputs", 0, 7),
				opt(
					or(
						// With an expression like `{....}`
						seq(
							text("->"),
							text("{"),
							capture(not(or(text("}!"), "}$"), ".+"), "handler"),
							text("}")
						),
						// A value processor list like `|len`
						seq(text("|"), capture("\\w+(,\\w+)*", "processors"))
					)
				)
			),
			opt(
				// The event itself
				seq(text("!"), capture("[A-Za-z]+", "event")),
				// And a event processor
				opt(
					text("|"),
					list(or(SLOT, text("#")), ",", "eventInputs", 0, 7),
					opt(
						or(
							// With an expression like `{....}`
							seq(
								text("->"),
								text("{"),
								capture(
									not(or(text("}!"), "}$"), ".+"),
									"eventProcessor"
								),
								text("}")
							)
						)
					)
				)
			),
			opt(capture(text("."), "stops")),
			"$"
		),
		seq(capture(SLOT, "slot"))
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
		res.assign = res.assign
			? Object.values(res.assign).map((_) => _.split("."))
			: [];
		return res;
	}
};

export const parseForDirective = (text) => {
	const res = parseSelector(text);
	// NOTE: We use to throw an error when there's more than one input,  but
	// that could still be a legit use case.
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
	const handlers = {};
	const slots = {};
	// TODO: That should be unified with the directives
	for (const attr of node.attributes || []) {
		if (blacklist && blacklist.indexOf(attr.name) !== -1) {
			continue;
		}
		// HTML attributes can't do camelCase.
		const items = attr.name.split(":");
		const ns = items.length > 1 ? items[0] : null;
		const name = items
			.at(-1)
			.split("-")
			.map((v, i) =>
				i === 0 ? v : `${v.charAt(0).toUpperCase()}${v.substring(1)}`
			)
			.join("");

		const v = attr.value;
		switch (ns) {
			case "on":
				// The reactor wraps a selector and feeds the event name
				// as first argument.
				handlers[name] = new Reactor(
					name,
					v && v.trim().length ? parseSelector(v, [name]) : null
				);
				break;
			case "in":
			case "out":
			case "inout":
			case "":
			case null:
				{
					const sel = !v.trim()
						? // Bindings will be inherited from scope
						  // NOTE: this used to be `undefined` instead of parseSelector,
						  // but it didn't work, so I think this is better.
						  parseSelector(name)
						: matchLiteralValue(v)
						? // This is a literal expression
						  parseLiteralValue(v)
						: matchLiteralSelector(v)
						? // This is an inline selector
						  parseLiteralSelector(v)
						: withSelectors && matchSelector(v)
						? parseSelector(v)
						: // Otherwise it's a string
						  v;
					slots[name] = ns === "inout" ? new Fused(name, sel) : sel;
				}
				break;
			default:
				// Technically we should probably issue a warning here for
				// unsupported namespace
				break;
		}
	}
	return { handlers, slots };
};

// FIXME: Not sure this is still needed
// --
// Extracts the `<* slot="SLOT_NAME">…</*>` descendants of the given DOM
// node, and returns them as an object if defined. Otherwise returns null. This
// also removes the nodes as they are added to the object.
export const extractSlots = (node, remove = true) => {
	const slots = {};
	let hasSlots = false;
	for (const slot of [...node.children]) {
		if (
			slot.nodeName.toLowerCase() === "slot" &&
			slot.hasAttribute("name")
		) {
			const n = slot.getAttribute("name") || "children";
			const l = slots[n];
			if (!l) {
				slots[n] = slot;
			} else if (l instanceof Array) {
				l.push(node);
			} else {
				slots[n] = [l, slot];
			}
			if (remove) {
				node.parentElement.removeChild(slot);
			}
			hasSlots = true;
		}
	}
	return hasSlots ? slots : null;
};

export const createHandlerBody = (inputs, handler) =>
	`${Object.values(inputs)
		.map((_) => {
			// FIXME: Should make sure that the inputs don't repeat.
			const p = _.split(".");
			return _ === "key" || _ === "#"
				? `const key=scope.key !== undefined ? scope.key : scope.path ? scope.path.at(-1) : null;`
				: `const ${p.at(-1)}=scope.get([${p
						.map((_) => `"${_}"`)
						.join(",")}]);`;
		})
		.join("")}; return (${handler})`;

export const createProcessorBody = (inputs, processors) => {
	const l = map(values(inputs), (_) =>
		_ === "#"
			? "scope.key"
			: `scope.get([${_.split(".")
					.map((_) => `"${_}"`)
					.join(",")}])`
	);
	return createProcessorExpression(
		processors,
		l.length === 0 ? "_" : l.length === 1 ? l[0] : `[${l.join(",")}]`
	);
};

export const createProcessorExpression = (processors, input = "_") => {
	const p = processors.map((_) => `${_}`);
	p.reverse();
	return p.reduce((r, v) => `${v}(${r})`, input);
};

// EOF
