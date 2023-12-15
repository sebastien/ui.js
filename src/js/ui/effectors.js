import { onError } from "./utils/logging.js";
import { access } from "./utils/collections.js";
import { Scope } from "./reactive.js";

// --
// ## Effectors
//
//

// -- doc
// The effect scope encapsulates the state of an effector, including
// where it gets its data from.

export class EffectScope extends Scope {
  constructor(parent, path, key) {
    super(parent);
    this.path = path;
    this.key = key;
    // This is the path for this scope in the parent scope
    this.handlers = new Map();
  }

  set value(value) {
    onError("Should not set scope.value", { value });
  }

  get value() {
    onError("Should not get scope.value");
    return null;
  }

  derive(slots = undefined, path = this.path, key = this.key) {
    const res = new EffectScope(
      // NOTE: There's a bit of a risk here as if value is change from the
      // parent, it won't be changed here.
      this,
      path,
      key
    );
    // TODO: WE should explain how that works
    if (slots) {
      res.define(slots);
    }
    return res;
  }

  triggerEvent(name, ...args) {
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

  get(path, offset = 0) {
    const k = path[offset];
    if (k === "#") {
      return this.key;
    } else {
      // Otherwise we resolve in the current scope
      return super.get(path, offset);
    }
  }

  trigger(event, scope, node, bubbles = true) {
    // This is typically called when the component is mounted
    console.log("TRIGGER", { event, scope, node, bubbles });
    if (this.handlers.has(event)) {
      for (const h of this.handlers.get(event)) {
        if (h(event, scope, node) === false) {
          return false;
        }
      }
    }
    return bubbles && this.parent
      ? this.parent.trigger(event, scope, bubbles)
      : true;
  }

  topics(path, offset = 0) {
    console.warn("TOPICS NOT IMPLEMENTED");
  }

  subs(path, creates = false, offset = 0) {
    console.warn("SUBS NOT IMPLEMENTED");
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
    this.selector = selector;
    this.node = node;
    this.scope = scope;
    this.value = undefined;

    // We perform some checks
    !node && onError("Effect(): effector should have a node", { node });

    // TODO: We need to do the binding
    // this.selection = selector && scope ? scope.select(selector) : null;
    const handler = (i) => (_) => {
      // FIXME: We should optimize this, as this will extract  all the values, otherwise
      // the selector will run again, and this is really not necessary.
      this.apply();
    };
    this.subs = selector
      ? selector.inputs.map((_, i) => this.scope.sub(handler(i), _.path))
      : null;
  }

  bind() {
    // TODO: Subscribe to the selection

    return this;
  }

  unbind() {
    // TODO: Unscubscribe to the selection
    return this;
  }

  init() {
    this.apply();
    this.bind();
    return this;
  }

  apply() {
    // We extract the latest value from the selection
    const value = this.scope.select(this.selector);
    // If the current selector has a target, we assign the target. Note that
    // this could also be done at the scope level by creating a reducer or
    // just assigning the node there.
    if (this.selector?.target) {
      this.scope.set(this.selector.target, value);
    }
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
