import { onError } from "./utils/logging.js";
import { access } from "./utils/collections.js";
import { SelectorType } from "./selector.js";
import { Scope } from "./reactive.js";

// --
// ## Effectors
//
//

// -- doc
// The effect scope encapsulates the state of an effector, including
// where it gets its data from.

export class EffectScope extends Scope {
  constructor(value, key, parent, path) {
    super(parent);
    this.key = key;
    // This is the path for this scope in the parent scope
    this.path = path;
    // This is the value extracted from the parent scope
    // FIXME: Value needs to be subscribed to
    this.value = value;
    this.handlers = new Map();
  }

  derive(path, localPath = undefined, slots = undefined, key = undefined) {
    // TODO: Remove localPath and slots?
    return new EffectScope(this.get(path), key, this, path);
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
    if (this.value && this.value[k] !== 0) {
      // We resolve in the current value first
      return access(this.value[k], path, offset + 1);
    } else {
      // Otherwise we resolve in the current scope
      return super.get(path, offset);
    }
  }

  sub(path, handler, offset = 0) {
    console.warn("SUB NOT IMPLEMENTED");
  }

  unsub(path, sub, offset = 0) {
    console.warn("UNSUB NOT IMPLEMENTED");
  }

  trigger(path, bubbles, offset = 0) {
    console.warn("TRIGGER NOT IMPLEMENTED");
  }

  topics(path, offset = 0) {
    console.warn("TOPICS NOT IMPLEMENTED");
  }

  subs(path, creates = false, offset = 0) {
    console.warn("SUBS NOT IMPLEMENTED");
  }

  // FIXME: A subscription is actually a dervied cell
  select(selector) {
    if (!selector) {
      return null;
    }
    switch (selector.type) {
      case SelectorType.Atom:
        return this.get(selector.inputs[0].path);
      case SelectorType.List:
        return selector.inputs.map((_) => this.get(_.path));
      case SelectorType.Map:
        return selector.inputs.reduce(
          (r, _) => ((r[_.name] = this.get(_.path)), r),
          {}
        );
      default:
        onError("Unsupported selector type", selector.type, { selector });
    }
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

    // We apply the selector to the scope and register a selection.
    // The selection will be updated as the contents changes.

    // TODO: We need to do the binding
    this.selection = selector && scope ? scope.select(selector) : null;
    // this.selection = selector
    //   ? selector.apply(scope, this.onChange.bind(this))
    //   : null;
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
