import { onError } from "./utils/logging.js";
import { Formats } from "./formats.js";
import { commonPath } from "./path.js";

// -- topic:directives
//
// ## Directives
//
// Directives are one-liners in a simple DSL that express selections,
// transformation, events on updates on data.
//
// A directive can have the following components:
//
// - A **data selection**, in the form of  path like `todos.items` (absolute) or `.label` (relative), a
//   special value such as `#key` (current key in the parent) or a combination of the above
//   `[..selected,#key]`, '{count:..items.length,selected:.selected}'
//
// - A **data transformation**, prefixed by `|` and using dot-separated names, such as
//   `.value|lowercase` or `.checked|not`, etc.
//
// - An *event*, prefixed by `!` such as `!.Added` or `Todo.Added`. When an event is suffixed by a `.`, it
//   will stop propagation and prevent the default.

// --
// ## Selector Input

// -- doc
// A selector input represents one specific selection in a selector,
// which is a collection of inputs. Selector inputs can select from
// the local state (`@` prefixed, like `@status`), or from the global state
// either in an absolute way (no prefix like `application.name`) or relative (`.` prefix like `.label`).

export const SelectorScope = Object.freeze({
	Local: "@",
	Relative: ".",
	Absolute: "/",
	Key: "#",
});

export const SelectorType = Object.freeze({
	Atom: "A",
	List: "L",
	Mapping: "M",
});

export class SelectorInput {
	constructor(type, path, isMany, format, key) {
		this.type = type || SelectorScope.Relative;
		this.path = path || [];
		Object.freeze(path);
		this.isMany = isMany;
		this.format = format
			? format instanceof Array
				? format
				: [format]
			: null;
		this.key = key;
		// TODO: Should freeze
	}

	formatted(value) {
		return this.format ? this.format.reduce((r, v) => v(r), value) : value;
	}

	toString() {
		const key = this.key ? `${this.key}=` : "";
		const format = this.format
			? this.format.map((_) => `|${_.name}`).join("")
			: "";
		return `${this.target ? `${this.target}=` : ""}${key}${
			this.type
		}${this.path.join(".")}${this.isMany ? "*" : ""}${format}`;
	}
}

// --
// ## Selector
//
// Selectors represent a selection in the data, which can be either:
//
// - The current (local) value
// - The global data store
// - The component (local) state
//

export class Selector {
	constructor(inputs, format = undefined, target = undefined) {
		this.inputs = inputs;
		this.format = format;
		this.isMany = inputs.length === 1 && inputs[0].isMany;
		this.type = inputs.reduce(
			(r, v) => (v.key ? SelectorType.Mapping : r),
			inputs.length > 1 ? SelectorType.List : SelectorType.Atom
		);
		this.fields = inputs.map((_) => _.key || _.path.at(-1));
		this.target = target;
		switch (this.type) {
			case SelectorType.Atom:
				this.path = this.inputs[0].path;
				break;
			case SelectorType.List:
			case SelectorType.Mapping:
				this.path = commonPath(this.inputs.map((_) => _.path));
				break;
			default:
				// ERROR
				this.path = null;
				onError(`Selector.path: Unknown selector type: ${this.type}`, {
					type: this.type,
				});
		}
		Object.freeze(this.path);
	}

	toString() {
		const event = this.event
			? `!${this.event}${this.stops ? "." : ""}`
			: "";
		return `${this.inputs.map((_) => _.toString()).join(",")}${event}`;
	}
}

// EOF
