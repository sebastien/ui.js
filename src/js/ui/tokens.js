import color, { RE_COLOR, Color } from "./color.js";
import { rules, propertyName, unpropertyName } from "./css.js";
import { map } from "./utils/collections.js";
import { numcode } from "./utils/text.js";
import { hash } from "./utils/ids.js";
import { onError } from "./utils/logging.js";

// --
// # Tokens

const RE_TOKEN_DIRECTIVE =
	/^((?<assignment>[A-Za-z][A-Za-z0-9]*(-[A-Za-z][A-Za-z0-9]*)*)=)?(?<tokens>.+)$/;

// TODO: We may want to have a literal string
const RE_TOKEN = new RegExp(
	"^((?<number>\\d+(?<decimal>\\.\\d+)?)(?<unit>\\w+)|(?<name>[\\w\\d_]+))$"
);

class TokensContext {
	constructor(tokens, classes = []) {
		this.classes = classes;
		this.value = undefined;
		this.color = undefined;
		Object.assign(this, tokens);
	}

	eval(value) {
		return value instanceof TokensContext ? this.value : value;
	}

	scaled(options) {
		const value = this.value;
		if (typeof value === "number") {
			const n = options.length;
			return options[Math.max(Math.min(n - 1, parseInt(value)), 0)];
		} else {
			onError(
				`TokensContext.scaled: value should be a number, got ${typeof value}`,
				{ value }
			);
			return null;
		}
	}
	addClass(name) {
		const n = name instanceof TokensContext ? name.value : name;
		this.classes.indexOf(n) === -1 && this.classes.push(n);
		return this;
	}
	toString() {
		return this.value instanceof Color ? this.value.hex : `${this.value}`;
	}
}

class Tokens {
	static Context = {};

	constructor(tokens = Tokens.Context) {
		this.tokens = tokens;
	}

	// -- doc
	// Returns `{rules, classes}` for the expanded tokens defined in the given
	// `text`, based on the `tokens` definition (optionally the current ones)
	parse(text, suffix = undefined, tokens = this.tokens) {
		const classes = [];
		const css = {};
		// Tokens are separated by spaces, like "TOKEN TOKEN TOKEN"
		for (let d of text.split(" ")) {
			// Tokens are now parsed
			const match = d.match(RE_TOKEN_DIRECTIVE);
			if (!match) {
				// They're expected to match
				onError(`Tokens.parse: Cannot parse token '${d}' in ${text}`);
			} else {
				// We parse the token and get a value from the chain of
				// tokens.
				const context = new TokensContext(tokens, classes);
				// The chain of tokens is separated by dots.
				for (let t of match.groups.tokens.split(".")) {
					// Now we try to parse the token
					const token = t.match(RE_TOKEN)?.groups;
					let value = undefined;
					if (!token) {
						// We can't match a token, so we look for the name
						// in our context, or otherwise the value will
						// be the string itself.
						value = context[t] || context[unpropertyName(t)] || t;
					} else if (token.name) {
						// If it's a named token, we lookup the corresponding
						// token in the context, defaulting to the token name.
						value =
							context[token.name] ||
							context[unpropertyName(token.name)] ||
							token.name;
						// If we have a function, we apply it to the context
						if (typeof value === "function") {
							value = value(context);
						}
					} else {
						// If it's a number, we apply it to the unit,
						// which we lookup in the context first.
						const v = token.decimal
							? parseFloat(token.number)
							: parseInt(token.number);
						context.value = v;
						const u = context[token.unit];
						value = u ? u(context) : `${v}${token.unit || "px"}`;
					}
					// We assign the created value.
					context.value = value;
					// If it's a color, we assign it.
					if (value instanceof Color) {
						context.color = value;
					}
				}
				// We assign the to our css;
				let value = context.value;
				const name = match.groups.assignment;
				if (name) {
					// If the directive has an assignment (eg. `bg=Blue`), then we need to
					// pass the context to the transformer, which will generate
					// CSS directives.
					const transformer =
						context[name] || context[unpropertyName(name)];
					if (!transformer) {
						onError(
							`Tokens.parse: Can't find transformer '${name}' or '${propertyName(
								name
							)}`,
							Object.keys(context)
						);
						value = null;
					} else {
						value = transformer(context);
						Object.assign(css, transformer(context));
					}
				}
				if (value === null) {
					// We had an error
				} else if (typeof value === "object") {
					Object.assign(css, value);
				} else {
					onError(
						`Token.parse: token expected to return an object: '${d} produced '${typeof value}'`,
						value
					);
				}
			}
		}
		return {
			rules: Object.entries(rules(css)).reduce((r, [k, v]) => {
				if (k.indexOf("&") !== -1) {
					const c = numcode(hash(v));
					classes.indexOf(c) === -1 && classes.push(c);
					r[k.replaceAll("&", `.${c}${suffix ? suffix : ""}`)] = v;
				} else {
					r[k] = v;
				}
				return r;
			}, {}),
			classes,
		};
	}
}

export const styled = (directive, suffix = undefined) =>
	new Tokens(Tokens.Context).parse(directive, suffix);

export const tokens = (tokens) =>
	Object.assign(
		Tokens.Context,
		map(tokens, (v) =>
			typeof v === "string" && v.match(RE_COLOR) ? color(v) : v
		)
	);

// --
// ## DSL

// --
// ## Interpreter

export default tokens;

// EOF
