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
//   special value such as `#key` (current key in the parent) or a combinatio of the above
//   `[..selected,#key]`, '{count:..items.length,selected:.selected}'
//
// - A **data transformation**, prefixed by `|` and using dot-separated names, such as
//   `.value|lowercase` or `.checked|not`, etc.
//
// - An *event*, prefixed by `!` such as `!.Added` or `Todo.Added`. When an event is suffixed by a `.`, it
//   will stop propagation and prevent the default.

// --
// ## Selector DSL
//
export const KEY = "([a-zA-Z]+=)?";
export const PATH = "#|([@.]?([A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*)";
export const FORMAT = "(\\|[A-Za-z-]+)?";
export const INPUT = `${KEY}${PATH}${FORMAT}`;
export const INPUT_FIELDS = `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(\\|(?<format>[A-Za-z-]+))?$`;
export const INPUTS = `${INPUT}(,${INPUT})*`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
export const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
export const EVENT = "(!(?<event>[A-Za-z]+(\\.[A-Za-z]+)*)(?<stops>\\.)?)?";
const RE_SELECTOR = new RegExp(`^(?<inputs>${INPUTS})${EVENT}$`);

class SelectorInput {
  static LOCAL = "@";
  static RELATIVE = ".";
  static ABSOLUTE = "";
  static KEY = "#";
  constructor(path, format, key) {
    const c = path.at(0);
    this.type =
      c === "@"
        ? SelectorInput.LOCAL
        : c === "."
        ? SelectorInput.RELATIVE
        : c === "#"
        ? SelectorInput.KEY
        : SelectorInput.ABSOLUTE;
    this.path = (
      this.type !== SelectorInput.ABSOLUTE ? path.substring(1) : path
    )
      .split(".")
      .filter((_) => _.length);
    this.format = format;
    this.key = key;
  }

  // -- doc
  // Applies this input to the local `value`, global `store`
  // and local `state`, where `value` is located at the given
  // `path`.
  apply(value, store, state, path = undefined) {
    if (this.type === SelectorInput.KEY) {
      return path ? path.at(-1) : undefined;
    }
    let context =
      this.type === SelectorInput.ABSOLUTE
        ? store
        : this.type === SelectorInput.RELATIVE
        ? value
        : state;
    for (let k of this.path) {
      context = context[k];
      if (context === undefined) {
        return context;
      }
    }
    return context;
  }

  toString() {
    const key = this.key ? `${this.key}=` : "";
    const format = this.format ? `|${this.format}` : "";
    return `${key}${this.type}${this.path.join(".")}${format}`;
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
class Selector {
  static SINGLE = 0;
  static LIST = 1;
  static MAP = 2;
  constructor(inputs, event, stops) {
    this.inputs = inputs;
    this.event = event;
    this.stops = stops;
    this.type = inputs.reduce(
      (r, v) => (v.key ? Selector.MAP : r),
      inputs.length > 1 ? Selector.LIST : Selector.SINGLE
    );
  }

  // -- doc
  // Applies this selector to the local `value`, global `store`
  // and local `state`, where `value` is located at the given
  // `path`.
  apply(value, store, state, path = undefined) {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].apply(value, store, state, path);
      case Selector.LIST: {
        const res = new Array(n);
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].apply(value, store, state, path);
        }
        return res;
      }
      case Selector.MAP: {
        const res = {};
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          const input = this.inputs[i];
          res[input.key ? input.key : i] = input.apply(
            value,
            store,
            state,
            path
          );
        }
        return res;
      }
      default:
        // ERROR
        break;
    }
  }

  toString() {
    const event = this.event ? `!${this.event}${this.stops ? "." : ""}` : "";
    return `${this.inputs.map((_) => _.toString()).join(",")}${event}`;
  }
}

export const parseInput = (text) => {
  const match = text.match(INPUT_FIELDS);
  if (!match) {
    return null;
  }
  const { key, path, format } = match.groups;
  return new SelectorInput(path, format, key);
};

// -- doc
// Parses the given selector and returns an `{inputs,event,stops}` structure.
export const parseSelector = (text) => {
  const match = text.match(RE_SELECTOR);
  if (!match) {
    return null;
  }
  const { event, stops } = match.groups;
  const inputs = match.groups["inputs"].split(",").map((_) => parseInput(_));
  return new Selector(inputs, event, stops);
};

// EOF
