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
//   special value such as `#key` (current key in the parent) or a combination of the above
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
//
// FIXME: We can't have both local and relative
export const PATH =
  "(#|([@.]?(\\*|([A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*(\\.\\*)?)))";
export const FORMAT = "(\\|[A-Za-z-]+)*";
export const INPUT = `${KEY}${PATH}${FORMAT}`;
export const INPUT_FIELDS = `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(?<formats>(\\|[A-Za-z-]+)+)?$`;
export const INPUTS = `${INPUT}(,${INPUT})*`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
export const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
export const EVENT =
  "(!(?<event>(\\.)?[A-Za-z]+(\\.[A-Za-z]+)*)(?<stops>\\.)?)?";
const RE_SELECTOR = new RegExp(`^(?<inputs>${INPUTS})${EVENT}$`);

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
// ## Selector Input

// -- doc
// A selector input represents one specific selection in a selector,
// which is a collection of inputs. Selector inputs can select from
// the local state (`@` prefixed, like `@status`), or from the global state
// either in an absolute way (no prefix like `application.name`) or relative (`.` prefix like `.label`).
export class SelectorInput {
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
  // Extracts the value for this input based on the local `value`, global `store`
  // and local `state`, where `value` is located at the given
  // `path`.
  extract(scope, state = undefined) {
    let res = undefined;
    const { path } = scope;
    if (this.type === SelectorInput.KEY) {
      res = path ? path.at(-1) : undefined;
    } else {
      // We ignore the cached value, we do a fresh extract
      const value = scope.state.get(path);
      let context =
        this.type === SelectorInput.ABSOLUTE
          ? scope.state.global
          : this.type === SelectorInput.LOCAL
          ? scope.local
          : this.type === SelectorInput.RELATIVE
          ? value
          : state;
      // NOTE: We used to throw a warning when the context was undefined,
      // but it does happen that there's no data, and that should not be
      // an issue.
      if (this.path.length && context !== undefined) {
        for (const k of this.path) {
          context = context[k];
          if (context === undefined) {
            break;
          }
        }
      }
      res = context;
    }
    const format = this.format;
    return format ? format(res, scope) : res;
  }

  // -- doc
  // Return this absolute path for this selector based on the given basepath.
  abspath(scope) {
    switch (this.type) {
      case SelectorInput.KEY:
        return scope.path;
      case SelectorInput.ABSOLUTE:
        return this.path;
      case SelectorInput.RELATIVE:
        return scope.path ? scope.path.concat(this.path) : this.path;
      case SelectorInput.LOCAL:
        return scope.localPath.concat(this.path);
      default:
        onError(`Unsupported selector input type: ${this.type}`, {
          selectorInput: this,
          scope,
        });
    }
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
// Selector states manage a spefic instance of a `Selector`, which
// can be bound to pub/sub bus, and update itself (triggering its `handler`)
// when the value change.
export class SelectorState {
  constructor(selector, scope, handler) {
    this.selector = selector;
    this.scope = scope;
    this.handler = handler;
    this.value = undefined;
    this.abspath = this.selector.abspath(scope);
    this.alwaysChange = false;
    // Handlers are registered when an input's monitored path changes
    this.handlers = selector.inputs.map(
      (_, i) =>
        (...args) =>
          this.onInputChange(_, i, ...args)
    );
  }

  init() {
    this.extract();
    return this;
  }

  // -- doc
  // Extracts the current value for this selector based on the current
  // `value` at `path`, the `global` state and the `local` component state.
  extract(value) {
    // TODO: Should we detect changes and store a revision number?
    this.value = this.selector.extract(this.scope, value);
    return this.value;
  }

  // -- doc
  // Binds the selector state to the given PubSub bus at the given `path`. The
  // selector state will be updated when one its inputs gets an updates.
  bind(scope) {
    // When we bind a selector state, each input will listen to its specific
    // value listened to.
    this.handlers.forEach((handler, i) => {
      const input = this.selector.inputs[i];
      scope.state.bus.sub(input.abspath(scope), handler, false);
    });
    return this;
  }

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
    let hasChanged = this.alwaysChange;
    const value = input.format ? input.format(rawValue, this.scope) : rawValue;
    switch (this.selector.type) {
      case Selector.SINGLE:
        if (value !== this.value) {
          this.value = value;
          hasChanged = true;
        }
        break;
      case Selector.LIST:
        {
          const i = this.selector.inputs[index];
          if (this.value[i] !== value) {
            this.value[i] = value;
            hasChanged = true;
          }
        }
        break;
      case Selector.MAP:
        {
          const k = this.selector.inputs[index].key;
          // FIXME: Difference between SCOPE and VALUE
          if (this.value[k] !== value) {
            this.value[k] = value;
            hasChanged = true;
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
    // At the end, we want to notify of a change if any of the input extracted value
    // has changed.
    if (hasChanged) {
      this.handler(this.value);
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
export class Selector {
  static SINGLE = "V";
  static LIST = "L";
  static MAP = "M";
  constructor(inputs, event, stops) {
    this.inputs = inputs;
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
    return new SelectorState(this, scope, handler).init();
  }

  // -- doc
  // Extracts the data selected by this selector using  the local `value` (at the given `path`), global `store` and local `state`, where `value` is located at the given `path`. Path is needed as selectors can extract the key as well.
  // TODO: apply(state)
  extract(scope, state = undefined) {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].extract(scope);
      case Selector.LIST: {
        const n = this.inputs.length;
        const res = state ? state : new Array(n);
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].extract(scope);
        }
        return res;
      }
      case Selector.MAP: {
        const res = state ? state : {};
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          const input = this.inputs[i];
          res[input.key ? input.key : i] = input.extract(scope);
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
  abspath(scope) {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].abspath(scope);
      case Selector.LIST:
      case Selector.MAP:
        return commonPath(this.inputs.map((_) => _.abspath(scope)));
      default:
        // ERROR
        onError(`Selector.extract: Unknown selector type: ${this.type}`, {
          type: this.type,
        });
        return null;
    }
  }
  abspaths(scope, state = undefined) {
    switch (this.type) {
      case Selector.SINGLE:
        return this.inputs[0].abspath(scope);
      case Selector.LIST: {
        const n = this.inputs.length;
        const res = state ? state : new Array(n);
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].abspath(scope);
        }
        return res;
      }
      case Selector.MAP: {
        const res = state ? state : {};
        const n = this.inputs.length;
        for (let i = 0; i < n; i++) {
          const input = this.inputs[i];
          res[input.key ? input.key : i] = input.abspath(scope);
        }
        return res;
      }
      default:
        // ERROR
        onError(`Selector.extract: Unsupported selector type: ${this.type}`, {
          type: this.type,
        });
        return state;
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
      : (_, scope) => formatters.reduce((r, v) => v(r, scope), _);

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
  const inputs = match.groups["inputs"].split(",").map((t, i) => {
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
  return new Selector(inputs, event, stops);
};

window.parseSelector = parseSelector;
export const CurrentValueSelector = parseSelector(".");
// EOF
