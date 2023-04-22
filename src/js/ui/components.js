import { StateTree } from "./state.js";
import { Templates } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { onError, makeKey } from "./utils.js";
import { PubSub } from "./pubsub.js";

// --
// ## Component Controller
//
// The component controller manages lifecycle events for a given controller,
// such as what happens when the component is *mounted* or *unmounted*, and
// registering component-instance specific handlers (ie. mapping local
// signal handlers).
export class Controller {
  static Events = new PubSub();

  constructor(scope) {
    this.scope = scope.split(".");
    this.handlers = {};
    this.lifecycle = {};
    this.onMount = undefined;
    this.onUnmount = undefined;
    // We assume that if we  create a controller, we do want to listen
    // to mount and unmount events, always.
    Controller.Events.sub(
      [...this.scope, "Mount"],
      (this.onMount = this.doMount.bind(this))
    );
    Controller.Events.sub(
      [...this.scope, "Unmount"],
      (this.onUnmount = this.doUnmount.bind(this))
    );
  }

  dispose() {
    Controller.Events.unsub(
      [...this.scope, "Mount"],
      (this.onMount = this.doMount.bind(this))
    );
    Controller.Events.unsub(
      [...this.scope, "Unmount"],
      (this.onUnmount = this.doUnmount.bind(this))
    );
  }

  mount(callback) {
    this.lifecycle["Mount"] = callback;
    return this;
  }

  unmount(callback) {
    this.lifecycle["Unmount"] = callback;
    return this;
  }

  on(key, callback) {
    switch (typeof key) {
      case "string":
        this.handlers[key] = callback;
        break;
      case "object":
        for (let k of Object.keys(key)) {
          this.on(k, key[k]);
        }
        break;
    }
    return this;
  }

  doMount(_, topic) {
    for (const event of topic.flush()) {
      // FIXME: This is awkward, all of that should be nicely wrapped
      const bus = event.scope.state.bus;
      for (const k in this.handlers) {
        bus.sub([...event.scope.localPath, k], this.handlers[k]);
      }
      this.lifecycle.Mount && this.lifecycle.Mount(event);
    }
  }

  doUnmount(event) {
    // FIXME: This is awkward, all of that should be nicely wrapped
    const bus = event.scope.state.bus;
    for (const k in this.handlers) {
      bus.unsub([...event.scope.localPath.scope, k], this.handlers[k]);
    }
    this.lifecycle.Unmount && this.lifecycle.Unmount(event);
  }
}

//  -- doc
//  `controller(scope:string|Array[string])` is the high-level function
//  to create a  `Controller` object.
export const controller = (scope) => new Controller(scope);

export class ComponentsContext {
  constructor(data = {}) {
    this.state = data instanceof StateTree ? data : new StateTree(data);
    this.events = Controller.Events;
  }
}

// --
// The `Component` class encapsulates an anchor node, a template effector,
// and state context
export class Component {
  constructor(id, anchor, template, context, path, slots, attributes) {
    this.id = id;
    this.anchor = anchor;
    this.template = template;
    this.context = context;
    const localPath = ["@local", this.id];
    if (slots) {
      context.state.patch(localPath, slots);
    }
    this.scope = new EffectScope(
      context.state,
      path || localPath,
      localPath,
      context.state.get(path || localPath),
      context.state.get(localPath),
      context.events
    );
    this.effect = template.apply(this.anchor, this.scope, attributes);
  }
}

// --
// Extracts the `<* slot="SLOT_NAME">…</*>` descendants of the given DOM
// node, and returns them as an object if defined. Otherwise returns null. This
// also removes the nodes as they are added to the object.
const extractSlots = (node) => {
  const slots = {};
  let hasSlots = false;
  for (const _ of node.querySelectorAll("*[slot]")) {
    const n = _.getAttribute("slot") || "children";
    const l = slots[n];
    if (!l) {
      slots[n] = _;
    } else if (l instanceof Array) {
      l.push(_);
    } else {
      slots[n] = [l, _];
    }
    _.parentElement.removeChild(_);
    hasSlots = true;
  }
  return hasSlots ? slots : null;
};

// --
// Takes a DOM node that typically has `data-ui` attribute and looks
// by applying a template.
export const createComponent = (node, context, templates = Templates) => {
  // --
  // We retrieve the following attributes:
  // - `data-ui`
  // - `data-path`
  const { ui, path } = node.dataset;

  // --
  // We validate that the template exists.
  const template = templates.get(ui);
  if (!template) {
    onError(`ui.render: Could not find template '${ui}'`, {
      node,
      ui,
    });
    return null;
  }

  // We create an anchor component, and replace the node with the anchor.
  const id = makeKey();
  const anchor = document.createComment(`⚓ ${ui}:${id}`);
  const attributes = [...node.attributes].reduce((r, v) => {
    if (!v.name.startsWith("data-")) {
      r.set(v.name, v.value);
    }
    return r;
  }, new Map());
  node.parentElement.replaceChild(anchor, node);

  return new Component(
    id,
    anchor,
    template,
    context,
    path ? path.split(".") : undefined,
    extractSlots(node),
    attributes
  );
};

// EOF
