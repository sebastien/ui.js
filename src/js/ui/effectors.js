import { CurrentValueSelector } from "./selector.js";
import { onError } from "./utils/logging.js";
import { access } from "./utils/collections.js";

// --
// ## Effectors
//
//

// -- doc
// The effect scope encapsulates the state of an effector, including
// where it gets its data from.

export class EffectScope {
  constructor(state, path, localPath, slots, key, parent = null) {
    // State store, which is a state tree and a pub/sub bus.
    this.state = state;
    // Main data selection path, the root for relative selectors
    this.path = path;
    // Path to the effect scope in the state store.
    this.localPath = localPath;
    // Key if the effect is part of a collection
    this.key = key;
    // TODO: Not sure what this is
    this.slots = slots;
    // Event handlers declared within the scope.
    this.handlers = new Map();
    this.parent = parent;
  }

  get value() {
    return this.state.get(this.path);
  }

  get local() {
    return this.state.get(this.localPath);
  }

  update(value, clear = false) {
    clear
      ? this.state.put(this.path, value)
      : this.state.patch(this.path, value);
    return this.value;
  }

  updateLocal(value, clear = false) {
    clear
      ? this.state.put(this.localPath, value)
      : this.state.patch(this.localPath, value);
    return this.value;
  }

  resolve(path) {
    return path
      ? path.at(-1) === "#"
        ? this.key
        : access(this.value, path)
      : this.value;
  }

  derive(path, localPath = this.localPath, slots = this.slots, key = this.key) {
    return new EffectScope(
      this.state,
      // NOTE: There's a question here whether we want the path to be relative
      // or absolute;
      [...this.path, ...(typeof path === "string" ? path.split(".") : path)],
      localPath,
      slots,
      key,
      this
    );
  }

  set(name, value) {}

  get(name) {}

  trigger(name, ...args) {
    let scope = this;
    while (scope && !scope.handlers.has(name)) {
      scope = scope.parent;
    }
    if (scope) {
      const handlers = scope.handlers.get(name);
      handlers &&
        handlers.forEach((handler) => {
          try {
            handler(...args, this, scope);
          } catch (exception) {
            onError(`${name}: Handler failed`, { handler, exception, args });
          }
        });
    }
  }

  toString() {
    return `EffectScope(path="${this.path.join(
      "."
    )}", localPath="${this.localPath.join(".")}", key="${this.key}")`;
  }
}

// --
// ## Effect
//
// Implements the base class of an effect.
export class Effect {
  constructor(effector, node, scope, selector = undefined) {
    this.effector = effector;
    this.node = node;
    this.scope = scope;
    this.value = undefined;

    // We perform some checks
    !node && onError("Effect(): effector should have a node", { node });
    !(selector || effector.selector) &&
      onError("Effect(): effector should have a selector", { effector });

    // We apply the selector to the scope and register a selection.
    // The selection will be updated as the contents changes.
    this.selection = (selector || effector.selector).apply(
      scope,
      this.onChange.bind(this)
    );

    // FIXME: Disabling this one
    // this.abspath = this.selection.abspath;
  }

  bind() {
    this.selection.bind(this.scope);
    return this;
  }

  unbind() {
    this.selection.unbind(this.scope);
    return this;
  }

  init() {
    this.apply();
    this.bind();
    return this;
  }

  apply() {
    // We extract the latest value from the selection
    const value = this.selection.extract();
    return this.unify(value, this.value);
  }

  unify(current, previous = this.value) {
    onError("Effect.unify not implemented", {
      this: this,
      parent: Object.getPrototypeOf(this),
    });
  }

  mount() {}
  unmount() {}

  dispose() {
    this.unmount();
    this.unbind();
  }

  onChange(value, event) {
    // The value is already extracted when `onChange` is called.
    this.unify(value, this.value);
  }
}

export class Effector {
  // -- doc
  //
  // An effector targets the node at the given `nodePath` and selects data
  // using the given `selector`.
  constructor(nodePath, selector) {
    this.nodePath = nodePath;
    this.selector = selector || CurrentValueSelector;
    if (!this.selector) {
      onError("Effector(): Effector has no selector defined", {
        selector: this.selector,
        nodePath,
      });
    }
  }

  // --
  // An effector is applied when the effect need to be instanciated
  apply(node, scope) {
    onError("Effector.apply: no implementation defined", {
      node,
      scope,
    });
  }
}

// EOF
