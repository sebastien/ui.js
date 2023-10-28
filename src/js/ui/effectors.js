import { onError } from "./utils/logging.js";
import { access } from "./utils/collections.js";

// --
// ## Effectors
//
//

// -- doc
// The effect scope encapsulates the state of an effector, including
// where it gets its data from.

const ScopeType = Object.freeze({
  // Path resolves from the local scope
  Scope: ".",
  // Path resolves from the current value (if any)
  Value: "_",
  // Path resolves from the absolute store
  Store: "/",
  // Path resolves from the key
  Key: "#",
});

export class EffectScope {
  constructor(store, path, localPath, slots, key, parent = null) {
    // State store, which is a state tree and a pub/sub bus.
    this.store = store;
    // Main data selection path, the root for relative selectors
    this.path = path || [];
    // Key if the effect is part of a collection
    this.key = key;
    // TODO: Not sure what this is
    this.slots = slots;
    // This is the current value
    this.current = store.get(this.path);
    // Event handlers declared within the scope.
    this.handlers = new Map();
    this.parent = parent;
  }

  sub(path, handler, withLast) {
    /// FIXME: Sub should be on a cell, really
    console.log("TODO: Scope.sub", path, handler);
  }

  set(name, value) {
    console.log("XXXX TODO: Scope.set", { name, value });
  }

  get(name) {
    console.log("XXXX TODO: Scope.get", { name });
  }

  resolve(path) {
    const k = path[0];
    if (this.slots && this.slots[k]) {
      return access(this.slots[k], path, 1);
    } else {
      return this.store.get(path);
    }
  }

  derive(path, localPath = undefined, slots = this.slots, key = this.key) {
    return new EffectScope(
      this.store,
      // NOTE: There's a question here whether we want the path to be relative
      // or absolute;
      [...this.path, ...(typeof path === "string" ? path.split(".") : path)],
      // FIXME: Local path is no more
      localPath,
      slots,
      key,
      this
    );
  }

  trigger(name, ...args) {
    console.warn("TRIGGER NOT IMPLEMENTED", { name, args });
    // let scope = this;
    // while (scope && !scope.handlers.has(name)) {
    //   scope = scope.parent;
    // }
    // if (scope) {
    //   const handlers = scope.handlers.get(name);
    //   handlers &&
    //     handlers.forEach((handler) => {
    //       try {
    //         handler(...args, this, scope);
    //       } catch (exception) {
    //         onError(`${name}: Handler failed`, { handler, exception, args });
    //       }
    //     });
    // }
  }

  toString() {
    return `EffectScope(path="${this.path.join(".")}", key="${this.key}")`;
  }
}

// --
// ## Effect
//
// Implements the base class of an effect.
export class Effect {
  constructor(effector, node, scope, selector = effector.selector) {
    this.effector = effector;
    this.node = node;
    this.scope = scope;
    this.value = undefined;

    // We perform some checks
    !node && onError("Effect(): effector should have a node", { node });

    // We apply the selector to the scope and register a selection.
    // The selection will be updated as the contents changes.

    this.selection = selector
      ? selector.apply(scope, this.onChange.bind(this))
      : null;
  }

  bind() {
    this.selection?.bind(this.scope);
    return this;
  }

  unbind() {
    this.selection?.unbind(this.scope);
    return this;
  }

  init() {
    this.apply();
    this.bind();
    return this;
  }

  apply() {
    // We extract the latest value from the selection
    const value = this.selection ? this.selection.extract() : undefined;
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
    // The selector may be empty, as not all effectors create a selection.
    this.selector = selector;
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
