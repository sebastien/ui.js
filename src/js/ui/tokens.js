// --
// # Tokens

import color, { RE_COLOR, Color } from "./color.js";

// const RE_TOKEN = new RegExp(
// 	"(\\.(?<key>[A-Za-z_]+)(?<factor>\\d+)|(?<value>\\d+(\\.\\d+)?)(?<unit>[A-Za-z]+)|(?<name>[A-Za-z_]+))",
// 	"g"
// );

export class Token {
	constructor(steps) {
		this.steps = [...steps];
	}

	// This is the main function
	eval(context = {}) {
		// The resolver becomes a function that gets assigned the state, while resolving
		// The context.
		const resolver = (
			name = "value",
			factor = undefined,
			state = undefined
		) => {
			const value =
				state && state[name] !== undefined
					? state[name]
					: context[name];
			if (typeof value === "string") {
				return { value: color(value) };
			} else if (typeof value === "function") {
				// TODO: We may want to merge in the rest of the context, maybe not only the value?
				factor = factor ? parseFloat(factor) : factor;
				const res = value(
					// NOTE: We copy the state in the function so that the context is accessible
					Object.assign(
						(name, factor) => resolver(name, factor, state).value,
						state
					),
					factor
				);
				return {
					value: res,
				};
			} else if (typeof value === "object") {
				return (({ value, ...rest }) => rest)(value);
			} else {
				throw new Error(`Undefined token '${name}'`);
			}
		};

		return this.steps.reduce((r, v) => {
			const { name, factor } = v;
			const { value, ...rest } = resolver(name, factor, r);
			return Object.assign(r, {
				color: value instanceof Color ? value : r.color,
				value,
				...rest,
			});
		}, {});
	}
}

export const token = (text) => {
	const r = [];
	while (true) {
		const m = RE_TOKEN.exec(text);
		if (!m) {
			break;
		} else if (m.groups.key !== undefined) {
			r.push({
				type: "factor",
				name: m.groups.key,
				factor: parseInt(m.groups.factor),
			});
		} else if (m.groups.name !== undefined) {
			r.push({ type: "symbol", name: m.groups.name });
		} else if (m.groups.value !== undefined) {
			r.push({
				type: "metric",
				factor: m.groups.value,
				name: m.groups.unit,
			});
		} else {
			throw new Error(`Unexpected match: ${m}`);
		}
	}
	return new Token(r);
};

const RE_TOKEN_DIRECTIVE = /((?<assignment>[a-z]+)=)?(?<tokens>.+)/;
const RE_TOKEN = new RegExp(
	"(?<number>\\d+(?<decimal>\\.\\d+)?)(?<unit>\\w+)|(?<name>[\\w\\d_]+)"
);

class TokensDefinition {
	constructor(tokens) {
		this.tokens = tokens;
	}
	parse(text, tokens = this.tokens) {
		console.log("PARSING", text);
		for (let d of text.split(" ")) {
			const match = d.match(RE_TOKEN_DIRECTIVE);
			if (match) {
				// We parse the token and get a value
				const context = { ...tokens };
				for (let t of match.groups.tokens.split(".")) {
					const token = t.match(RE_TOKEN)?.groups;
					let value = undefined;
					if (!token) {
						// TODO: Should log error
					} else if (token.name) {
						value = context[token.name];
						if (typeof value === "function") {
							value = value(context);
						}
					} else {
						const v = token.decimal
							? parseFloat(token.number)
							: parseInt(token.number);
						const u = context[token.unit];
						value = `${v}${u ? u(v) : token.unit || "px"}`;
					}
					context.value = value;
					if (value instanceof Color) {
						context.color = value;
					}
				}
				// We assign the value
				const value = context.value;
				const name = match.groups.assignment;
				if (name) {
					const transform = context[name];
					const rule = transform(value);
					// TODO: We should process and register the rule
				}
			}
		}
	}
}
export const parseDefinition = (definition) => {
	const res = {};
	for (let k in definition) {
		const v = definition[k];
		const t = typeof v;
		if (t === "string") {
			if (v.match(RE_COLOR)) {
				res[k] = color(v);
			} else {
				console.log("TODO: String", v);
			}
		} else if (t === "function") {
			res[k] = v;
		} else {
			res[k] = v;
		}
	}
	return new TokensDefinition(res);
};

export const tokens = parseDefinition;
// SEE: Sourced from <https://observablehq.com/@sebastien/styling>

// --
// ## DSL

// --
// ## Interpreter

export default tokens;

// EOF
