import { Empty } from "./utils/values.js";
import { onError } from "./utils/logging.js";
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
const RE_PATH = /^(?<type>[#@/]?)(?<prefix>\.*)(?<rest>.*)/;
export class SelectorInput {
  static LOCAL = "@";
  static RELATIVE = "";
  static ABSOLUTE = "/";
  static KEY = "#";
  constructor(path, format, key) {
    const { type, prefix, rest } = path.match(RE_PATH).groups;
    this.type = type;
    this.unwind = prefix ? Math.max(0, prefix.length - 1) : 0;
    this.path = rest.length ? rest.split(".") : [];
    this.isMany = this.path.at(-1) === "*";
    if (this.isMany) {
      this.path.pop();
    }
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
  // Returns the absolute path of this selector input in the given scope.
  abspath(scope) {
    return (
      this.unwind ? scope.path.slice(0, 0 - this.unwind) : scope.path
    ).concat(this.path);
  }

  // -- doc
  // Extracts the value for this input based on the given scope. This
  // applies formatting.
  extract(scope) {
    let res = undefined;
    if (this.type === SelectorInput.KEY) {
      res = scope.path.at(-1);
    } else {
      res = scope.state.get([
        ...(this.unwind ? scope.path.slice(0, 0 - this.unwind) : scope.path),
        ...this.path,
      ]);
    }
    // NOTE: There use to be a scope passed
    return this.format ? this.format(res) : res;
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
export class Selector {
  static SINGLE = "V";
  static LIST = "L";
  static MAP = "M";
  constructor(inputs, event, stops, format = undefined) {
    this.inputs = inputs;
    this.format = format;
    this.event = event;
    this.stops = stops;
    this.isMany = inputs.length === 1 && inputs[0].isMany;
    this.type = inputs.reduce(
      (r, v) => (v.key ? Selector.MAP : r),
      inputs.length > 1 ? Selector.LIST : Selector.SINGLE
    );
  }

  // -- doc
  // Applies the selector at the given value and location. This returns
  // a selector state that can subscribe to value, transform them and
  // notify of updates.
  apply(scope, handler) {
    return new Selection(this, scope, handler).init();
  }

  abspath(scope) {
    // This returns the common ancestor between all paths
    const paths = this.inputs.map((_) => _.abspath(scope));
    const n = paths[0].length;
    const m = paths.length;
    let i = 0;
    while (i < n) {
      for (let j = 0; j < m; j++) {
        // If the current path is shorter than the current path, or if
        // if the current path item differs from the previous path, then we return.
        if (i >= paths[j].length || (j > 0 && paths[j - 1][i] != paths[j][i])) {
          return paths[0].slice(0, Math.max(0, i - 1));
        }
      }
      i++;
    }
    return paths[0];
  }

  // -- doc
  // Extracts the data selected by this selector available at the given `scope`.
  // Note that the returned value has formatting already applied.
  extract(scope, raw = false) {
    let res = undefined;
    switch (this.type) {
      case Selector.SINGLE:
        res = this.inputs[0].extract(scope);
        break;
      case Selector.LIST: {
        const n = this.inputs.length;
        res = new Array(n);
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].extract(scope);
        }
        break;
      }
      case Selector.MAP: {
        res = {};
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          const input = this.inputs[i];
          res[input.key ? input.key : i] = input.extract(scope);
        }
        break;
      }
      default:
        // ERROR
        onError(`Selector.apply: Unsupported selector type: ${this.type}`, {
          type: this.type,
        });
        break;
    }
    // We apply the formatting
    return this.format && !raw ? this.format(res) : res;
  }

  get path() {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].path;
      case Selector.LIST:
      case Selector.MAP:
        return commonPath(this.inputs.map((_) => _.path));
      default:
        // ERROR
        onError(`Selector.path: Unknown selector type: ${this.type}`, {
          type: this.type,
        });
    }
    return null;
  }

  toString() {
    const event = this.event ? `!${this.event}${this.stops ? "." : ""}` : "";
    return `${this.inputs.map((_) => _.toString()).join(",")}${event}`;
  }
}

// FIXME: This is awfully similar to the controller Reducers, but for now
// it makes sense to have these separate.
//
// --
// ## Selection
//
// A selectionmanage a specific application of a `Selector`, which
// can be bound to pub/sub bus, and update itself (triggering its `handler`)
// when the value change.
export class Selection {
  constructor(selector, scope, handler) {
    this.selector = selector;
    this.scope = scope;
    this.handler = handler;
    this.raw = undefined;
    this.value = undefined;
    this.path = this.selector.abspath(scope);
    this.alwaysChange = false;
    // Handlers are registered when an input's monitored path changes
    this.handlers = selector.inputs.map(
      (_, i) =>
        (...args) =>
          this.onInputChange(_, i, ...args)
    );
  }

  init() {
    this.raw = this.extract(this.scope, true);
    this.value = this.selector.format
      ? this.selector.format(this.raw)
      : this.raw;
    return this;
  }

  // NOTE: This should really be a piull()
  // -- doc
  // Extracts the current value for this selector based on the current
  // `value` at `path`, the `global` state and the `local` component state.
  extract(scope = this.scope, raw = false) {
    // TODO: Should we detect changes and store a revision number?
    // TODO: Yeah, totally.
    return this.selector.extract(scope, raw);
  }

  // -- doc
  // Binds the selector state to the given PubSub bus at the given `path`. The
  // selector state will be updated when one its inputs gets an updates.
  // // FIXME: We should not need the scope
  bind(scope) {
    // When we bind a selector state, each input will listen to its specific
    // value listened to.
    this.handlers.forEach((handler, i) => {
      const input = this.selector.inputs[i];
      scope.state.bus.sub(input.abspath(scope), handler, false);
    });
    return this;
  }

  // // FIXME: We should not need the scope
  unbind(scope) {
    this.handlers.forEach((handler, i) => {
      const input = this.selector.inputs[i];
      scope.state.bus.unsub(input.abspath(scope), handler, false);
    });
    return this;
  }

  // FIXME: This should capture the global and state scope to work,
  // as extractors won't work otherwise.
  //
  // -- doc
  // `onInputChange` is triggered when the value at the path listened to by the input
  // has changed. This means that the value in the event is already
  onInputChange(input, index, rawValue) {
    // FIXME: We should manage update cycles, for instance, if the state is being
    // updated we want to wait for the end of the cycle to trigger the effects,
    // as otherwise we'll render the effects too many times, which is especially
    // true for composite selections.
    // --
    // If it's a many selector, it needs to be changed right away
    let hasChanged = this.alwaysChange || this.selector.isMany;
    const value =
      rawValue === Empty
        ? undefined
        : input.format
        ? input.format(rawValue, this.scope)
        : rawValue;
    const current = this.raw;
    switch (this.selector.type) {
      case Selector.SINGLE:
        if (value !== current) {
          this.raw = value;
          hasChanged = true;
        }
        break;
      case Selector.LIST:
        {
          const i = index;
          if (current[i] !== value) {
            this.raw[i] = value;
            hasChanged = true;
          }
        }
        break;
      case Selector.MAP:
        {
          const k = this.selector.inputs[index].key;
          // FIXME: Difference between SCOPE and VALUE
          if (current[k] !== value) {
            if (rawValue === Empty) {
              delete this.raw[k];
            } else {
              this.raw[k] = value;
            }
            hasChanged = true;
          }
        }
        break;
      default:
        onError(
          `Selection.onInputChange: Unsupported selector type '${this.selector.type}'`,
          { selector: this.selector }
        );
        break;
    }
    // At the end, we want to notify of a change if any of the input extracted value
    // has changed.
    if (hasChanged) {
      this.value = this.selector.format
        ? this.selector.format(this.raw)
        : this.raw;
      this.handler(this.value);
    }
  }

  dispose() {}

  toString() {
    return `Selection(path="${this.path.join(
      "."
    )}",selector="${this.selector.toString()}")`;
  }
}

// --
// ## Selector DSL
//
export const KEY = "([a-zA-Z]+=)?";
//
// FIXME: We can't have both local and relative
export const PATH =
  "(#|(([@/]?\\.*)(\\*|([A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*(\\.\\*)?)))";
export const FORMAT = "(\\|[A-Za-z-]+)*";
export const INPUT = `${KEY}${PATH}${FORMAT}`;
export const INPUTS = `(\\((?<inputList>${INPUT}(,${INPUT})*)\\)(?<inputListFormat>${FORMAT})|(?<inputSeq>${INPUT}(,${INPUT})*))`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
export const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
export const SELECTOR = `^(?<selector>${INPUTS})`;
const RE_SELECTOR = new RegExp(SELECTOR);

export const commonPath = (paths) => {
  let i = 0;
  let n = paths.reduce(
    (r, _, i) => (i === 0 ? _.length : Math.min(_.length, r)),
    0
  );
  const op = paths[0];
  while (i < n) {
    for (const cp of paths) {
      if (cp[i] !== op[i]) {
        return cp.slice(0, i);
      }
    }
    i++;
  }
  return op.slice(0, n);
};

// --
// Parse the given input, returning a `SelectorInput` structure.
export const RE_INPUT = new RegExp(
  `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(?<formats>(\\|[A-Za-z-]+)+)?$`
);

export const parseFormat = (text) => {
  const formatters = (text || "").split("|").reduce((r, v) => {
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
  return formatters.length === 0
    ? null
    : formatters.length === 1
    ? formatters[0]
    : (_, scope) => formatters.reduce((r, v) => v(r, scope), _);
};

export const parseInput = (text) => {
  const match = text.match(RE_INPUT);
  if (!match) {
    return null;
  }
  const { key, path, formats } = match.groups;
  return new SelectorInput(path, parseFormat(formats), key);
};

// -- doc
// Parses the given selector and returns an `{inputs,event,stops}` structure.
export const parseSelector = (text) => {
  const match = text.match(RE_SELECTOR);
  if (!match) {
    return null;
  }
  const { event, stops, inputList, inputListFormat, inputSeq } = match.groups;
  const parsedInputs = (inputList || inputSeq).split(",").map((t, i) => {
    const res = parseInput(t);
    if (!res) {
      onError(
        `selector.parseSelector: Could not parse input ${i} "${t}" in "${text}"`,
        {
          input: t,
          text,
          match,
        }
      );
    }
    return res;
  });
  return new Selector(parsedInputs, event, stops, parseFormat(inputListFormat));
};

export const CurrentValueSelector = parseSelector(".");

// EOF
