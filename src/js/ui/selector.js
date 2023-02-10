import { composePaths } from "./paths.js";
import { onError } from "./utils.js";
import { Formats } from "./formats.js";

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
export const INPUT_FIELDS = `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(?<formats>(\\|[A-Za-z-]+)+)?$`;
export const INPUTS = `${INPUT}(,${INPUT})*`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
export const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
export const EVENT = "(!(?<event>[A-Za-z]+(\\.[A-Za-z]+)*)(?<stops>\\.)?)?";
const RE_SELECTOR = new RegExp(`^(?<inputs>${INPUTS})${EVENT}$`);

// --
// ## Selector Input
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
    this.format = format
      ? format instanceof Function
        ? format
        : Formats[format]
      : null;
    if (this.format === undefined) {
      onError(`SelectorInput: Format undefined '${format}'`, {
        path,
        format,
        key,
      });
    }
    this.key = key;
  }

  // -- doc
  // Applies this input to the local `value`, global `store`
  // and local `state`, where `value` is located at the given
  // `path`.
  apply(value, store, state, path = undefined) {
    let res = undefined;
    if (this.type === SelectorInput.KEY) {
      res = path ? path.at(-1) : undefined;
    } else {
      let context =
        this.type === SelectorInput.ABSOLUTE
          ? store
          : this.type === SelectorInput.RELATIVE
          ? value
          : state;
      for (let k of this.path) {
        context = context[k];
        if (context === undefined) {
          break;
        }
      }
      res = context;
    }
    const format = this.format;
    return format ? format(res) : res;
  }

  toString() {
    const key = this.key ? `${this.key}=` : "";
    const format = this.format ? `|${this.format}` : "";
    return `${key}${this.type}${this.path.join(".")}${format}`;
  }
}

// --
// ## Selector State
//
// Selector states can manage a selection on a pub/sub bus and manage
// and update to its data.
class SelectorState {
  constructor(selector, handler, value = undefined) {
    this.selector = selector;
    this.handler = handler;
    this.value = undefined;
    this.handlers = selector.inputs.map(
      (_, i) =>
        (...args) =>
          this.onInputChange(_, i, ...args)
    );
  }

  apply(value, global, local, path) {
    // TODO: Should we detect changes and store a revision number?
    this.value = this.selector.extract(value, global, local, path);
    return this.value;
  }

  bind(bus, path) {
    this.handlers.forEach((handler, i) => {
      const input = this.selector.inputs[i];
      switch (input.type) {
        case "":
          bus.sub(input.path, handler, false);
          break;
        case ".":
          bus.sub(composePaths(path, input.path), handler, false);
          break;
        default:
          console.warn(
            `SelectorState: Input type not supported yet: ${input.type}`,
            { input }
          );
        // TODO: Sub state changes
      }
    });
    return this;
  }

  unbind(bus, path) {
    this.handlers.forEach((handler, i) => {
      const input = this.selector.inputs[i];
      switch (input.type) {
        case "":
          bus.unsub(input.path, handler, false);
          break;
        case ".":
          bus.unsub(composePaths(path, input.path), handler, false);
          break;
        default:
          console.warn(
            `SelectorState: Input type not supported yet: ${input.type}`,
            { input }
          );
        // TODO: Sub state changes
      }
    });
    return this;
  }

  onInputChange(input, index, event, ...rest) {
    let hasChanged = false;
    switch (event.name) {
      case "Update":
        switch (this.selector.type) {
          case Selector.SINGLE:
            if ((hasChanged = this.value !== event.value)) {
              this.value = event.value;
            }
            break;
          case Selector.LIST:
            {
              const i = this.inputs[index];
              if ((hasChanged = this.value[i] !== event.value)) {
                this.value[i] = event.value;
              }
            }
            break;
          case Selector.MAP:
            {
              const k = this.inputs[index].key;
              if ((hasChanged = this.value[k] !== event.value)) {
                this.value[k] = event.value;
              }
            }
            break;
          default:
            onError(
              `SelectorState.onInputChange: Unsupported selector type '${this.selector.type}'`,
              { selector: this.selector }
            );
            break;
        }
        break;
      default:
        onError(
          `SelectorState.onInputChange: Unsupported event '${event.name}'`,
          { event }
        );
    }
    if (hasChanged) {
      this.handler(this.value, event);
    }
  }

  dispose() {}
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
  // Applies the selector at the givene value and location. This returns
  // a selector state that can subscribe to value, transform them and
  // notify of updates.
  apply(value, store, state, path = undefined, handler = undefined) {
    const datum = this.extract(value, store, state, path);
    return new SelectorState(this, handler, datum);
  }

  // -- doc
  // Extracts the data selected by this selector using  the local `value` (at the given `path`), global `store` and local `state`, where `value` is located at the given `path`. Path is needed as selectors can extract the key as well.
  extract(value, global, local, path = undefined, state = undefined) {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].apply(value, global, local, path);
      case Selector.LIST: {
        const res = state ? state : new Array(n);
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].apply(value, global, local, path);
        }
        return res;
      }
      case Selector.MAP: {
        const res = state ? state : {};
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          const input = this.inputs[i];
          res[input.key ? input.key : i] = input.apply(
            value,
            global,
            local,
            path
          );
        }
        return res;
      }
      default:
        // ERROR
        onError(`Selector.extract: Unsupported selector type: ${this.type}`, {
          type: this.type,
        });
        break;
    }
  }

  toString() {
    const event = this.event ? `!${this.event}${this.stops ? "." : ""}` : "";
    return `${this.inputs.map((_) => _.toString()).join(",")}${event}`;
  }
}

// --
// ## High Level API

// --
// Parse the given input, returning a `SelectorInput` structure.
export const parseInput = (text) => {
  const match = text.match(INPUT_FIELDS);
  if (!match) {
    return null;
  }
  const { key, path, formats } = match.groups;
  const formatters = (formats || "").split("|").reduce((r, v) => {
    const f = Formats[v];
    if (!v) {
      return r;
    } else if (f === undefined) {
      onError(
        `Could not find format ${v} in selector ${text}, pick one of ${Object.keys(
          Formats
        ).join(", ")}`
      );
      return r;
    } else {
      r.push(f);
      return r;
    }
  }, []);
  const formatter =
    formatters.length === 0
      ? null
      : formatters.length === 1
      ? formatters[0]
      : (_) => formatters.reduce((r, v) => v(r), _);

  return new SelectorInput(path, formatter, key);
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

export const CurrentValueSelector = parseSelector(".");
// EOF
