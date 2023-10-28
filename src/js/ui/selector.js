import { Empty } from "./utils/values.js";
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
const RE_PATH = /^(?<type>[#@/]?)(?<prefix>\.*)(?<rest>.*)/;

const SelectorScope = Object.freeze({
  Local: "@",
  Relative: ".",
  Absolute: "/",
  Key: "#",
});
const SelectorType = Object.freeze({
  Atom: "_",
  List: "[]",
  Mapping: "{}",
});

export class SelectorInput {
  constructor(type, path, isMany, format, key) {
    this.type = type || SelectorScope.Relative;
    this.path = path || [];
    this.isMany = isMany;
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
  // Extracts the value for this input based on the given scope. This
  // applies formatting.
  extract(scope) {
    let res = undefined;
    if (this.type === SelectorScope.Key) {
      res = scope.key;
    } else {
      res = scope.resolve(this.path);
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
  constructor(inputs, event, stops, format = undefined) {
    this.inputs = inputs;
    this.format = format;
    this.event = event;
    this.stops = stops;
    this.isMany = inputs.length === 1 && inputs[0].isMany;
    this.type = inputs.reduce(
      (r, v) => (v.key ? SelectorType.Mapping : r),
      inputs.length > 1 ? SelectorType.List : SelectorType.Atom
    );
  }

  // -- doc
  // Applies the selector at the given value and location. This returns
  // a selector state that can subscribe to value, transform them and
  // notify of updates.
  apply(scope, handler) {
    return new Selection(this, scope, handler).init();
  }

  // -- doc
  // Extracts the data selected by this selector available at the given `scope`.
  // Note that the returned value has formatting already applied.
  extract(scope, raw = false) {
    let res = undefined;
    switch (this.type) {
      case SelectorType.Atom:
        res = this.inputs[0].extract(scope);
        break;
      case SelectorType.List: {
        const n = this.inputs.length;
        res = new Array(n);
        for (let i = 0; i < n; i++) {
          res[i] = this.inputs[i].extract(scope);
        }
        break;
      }
      case SelectorType.Mapping: {
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
      case SelectorType.Atom:
        return this.inputs[0].path;
      case SelectorType.List:
      case SelectorType.Mapping:
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

// TODO: This should probably be move to cells
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

  // NOTE: This should really be a pull()
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
    // this.handlers.forEach((handler, i) => {
    //   const input = this.selector.inputs[i];
    //   scope.sub(input.abspath(scope), handler, false);
    // });
    return this;
  }

  // // FIXME: We should not need the scope
  unbind(scope) {
    // this.handlers.forEach((handler, i) => {
    //   const input = this.selector.inputs[i];
    //   scope.unsub(input.abspath(scope), handler, false);
    // });
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
    return `Selection(selector="${this.selector.toString()}")`;
  }
}

// EOF
