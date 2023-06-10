import { parsePath } from "./paths.js";
import { Templates } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { onError, makeKey } from "./utils.js";

// --
//
// ## Controller Cells
//

export class Cell {
  constructor() {
    this.scope = undefined;
  }

  bind(scope) {
    this.scope = scope;
  }

  unbind() {
    this.scope = undefined;
  }

  get value() {
    throw new Error("Cell.value not implemented", { cell: this });
  }

  sub(handler) {
    throw new Error("Cell.sub not implemented", { cell: this });
  }

  unsub(handler) {
    throw new Error("Cell.unsub not implemented", { cell: this });
  }

  set(value) {
    throw new Error("Cell.set not implemented", { cell: this });
  }
}

class LocalCell extends Cell {
  constructor() {
    super();
    this.handlers = [];
    this._value = undefined;
  }

  get value() {
    return this._value;
  }

  sub(handler) {
    this.handlers.push(handler);
    return this;
  }

  unsub(handler) {
    this.handlers.remove(handler);
    return this;
  }

  set(value) {
    if (this._value !== value) {
      this._value = value;
      this.trigger(value, this);
    }
    return value;
  }

  trigger(...args) {
    for (const handler of this.handlers) {
      try {
        handler(...args);
      } catch (e) {
        onError("components: Handler failed", { cell: this, handler });
      }
    }
  }
}

export class StateCell extends Cell {
  constructor(path, value = undefined) {
    super();
    this.path = path;
    this.default = value;
    this.topic = undefined;
  }

  bind(scope) {
    super.bind(scope);
    this.topic = this.scope.state.bus.get(this.path);
    // If the slot has a default value and there is no value currently
    // defined in the state, then we assign it.
    if (this.default !== undefined) {
      if (this.scope.state.get(this.path) === undefined) {
        this.scope.state.put(this.path, this.default);
      }
    }
  }

  get value() {
    return this.scope.state.get(this.path);
  }

  sub(handler) {
    this.topic.sub(handler);
    return this;
  }

  unsub(handler) {
    this.topic.unsub(handler);
    return this;
  }

  set(value) {
    this.scope.state.put(this.path, value);
  }

  append(value) {
    this.scope.state.append(this.path, value);
  }

  //   TODO
  //   insert(key, value) {}
  //
  //   pop(key) {}
  //
  //   removeAt(key) {}
  //
  //   remove(value) {}
  // clear() {}
}

export class Ref extends StateCell {
  constructor(name) {
    super(undefined, undefined);
    this.name = name;
  }

  bind(scope) {
    this.path = [...scope.localPath, `#${this.name}`];
    return super.bind(scope);
  }
}

export class Slot extends StateCell {}

// FIXME: We may want to specialize based on the type of reducer
export class Reducer extends Cell {
  constructor(inputs, functor, input, handlers) {
    super();
    this.inputs = inputs;
    this.functor = functor;
    this._value = undefined;
    this.input = input;
    this.handlers = handlers;
  }

  onInputChange(key, value, ...rest) {
    onError("Slot.onInputChange: Not implemented", { slot: this });
  }

  doUpdate() {
    this._value = this.functor(...this.input);
  }
}

class AtomReducer extends Reducer {
  constructor(inputs, functor) {
    super(inputs, functor, undefined, (...args) =>
      this.onInputChange(null, ...args)
    );
  }

  bind(scope) {
    super.bind(scope);
    this.inputs.sub(this.handlers);
    this.input = this.inputs.value;
    this.doUpdate();
  }

  onInputChange(key, value, ...rest) {
    if (this.input !== value) {
      this.input = value;
      this.doUpdate();
      this._value = this.functor(this.input);
    }
  }
}

class ArrayReducer extends Reducer {
  constructor(inputs, functor) {
    super(
      inputs,
      functor,
      inputs.map(() => undefined),
      inputs.map(
        (_, i) =>
          (...args) =>
            this.onInputChange(i, ...args)
      )
    );
  }

  bind(scope) {
    super.bind(scope);
    this.input = this.inputs.map((cell, i) => {
      cell.sub(this.handlers[i]);
      return cell.value;
    });
    this.doUpdate();
  }

  doUpdate() {
    this._value = this.functor(...this.input);
  }

  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this.doUpdate();
    }
  }
}

class MapReducer extends Reducer {
  constructor(inputs, functor) {
    super(
      inputs,
      functor,
      Object.keys(inputs).reduce((r, k) => {
        r[k] = undefined;
        return r;
      }, {}),
      Object.keys(inputs).reduce((r, k) => {
        r[k] = (...args) => this.onInputChange(k, ...args);
        return r;
      }, {})
    );
  }

  bind(scope) {
    super.bind(scope);
    this.input = {};
    for (const [key, cell] of Object.entries(this.inputs)) {
      cell.path.sub(this.handlers[key]);
      this.input[key] = cell.value;
    }
    this.doUpdate();
  }

  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this._value = this.functor(this.input);
    }
  }
}

// --
// The `Use` class creates a factory object that creates cells.
class Use {
  constructor(cells, scope) {
    this.cells = cells;
    this.scope = scope;
  }

  cell(cell) {
    this.cells.push(cell.bind(this.scope));
    return cell;
  }

  hash(path) {
    return this.cell(new Slot(["@hash", ...parsePath(path)]));
  }

  ref(name) {
    return this.cell(new Ref(name));
  }

  global(path) {
    return this.cell(new Slot(parsePath(path)));
  }

  local(path, value) {
    return this.cell(
      new Slot([...this.scope.localPath, ...parsePath(path)], value)
    );
  }

  effect(inputs, functor) {
    return this.derived(inputs, functor);
  }

  derived(inputs, functor) {
    return this.cell(
      inputs instanceof Cell
        ? new AtomReducer(inputs, functor)
        : inputs instanceof Array
        ? new ArrayReducer(inputs, functor)
        : new MapReducer(inputs, functor)
    );
  }
}

// ============================================================================
// CONTROLLERS
// ============================================================================

// --
//
// ## Controllers
//

const onHandler = (target, property) => {
  return (handler) => {
    if (target.has(property)) {
      target.get(property).push(handler);
    } else {
      target.set(property, [handler]);
    }
    return handler;
  };
};

export const Controllers = new Map();
export const controller = (controller, controllers = Controllers) => {
  const name = controller.name;
  if (!name) {
    onError(
      "Controller definition should be a named function, no .name attribute found",
      { controller }
    );
  }
  if (typeof controller !== "function") {
    onError(
      `Controller definition should be a named function, not a '${typeof controller}'`,
      { controller }
    );
  }
  if (controllers.has(name)) {
    onError("Controller already registered", { name, controllers });
  } else {
    controllers.set(name, controller);
  }
  return controller;
};

// --
// Creates an instance of the controller, using the given definition and scope.
export const createController = (definition, scope) => {
  if (!scope) {
    onError("components.createController: scope is expected, got nothing", {
      definition,
      scope,
    });
  }

  // `on` is a proxy object that will populate the `events` map
  const events = new Map();
  const on = new Proxy(events, { get: onHandler });

  // `use` wraps the cells and scope
  const cells = [];
  const use = new Use(cells, scope);

  // Now we run the definition, which should populate the cells and events.
  definition({ use, on });

  // We process the event handlers
  for (const [name, handlers] of events.entries()) {
    const eventName = `${name.charAt(0).toUpperCase()}${name.substring(1)}`;
    scope.handlers.set(
      eventName,
      (scope.handlers.get(eventName) || []).concat(handlers)
    );
    // if (eventName === "Mount") {
    //   console.log("MOUNT", eventName);
    //   trigger(scope);
    // } else {
    //   console.log("HANDLER", { eventName });
    //   // scope.state.bus.sub([...scope.localPath, eventName], trigger);
    //   triggers.set(eventName, trigger);
    // }
  }

  // TODO: On unmount, a component should:
  // - Cleanup its namespace
  // - Execute effect unmount hooks

  //
  // If we registered handlers, then we unmount them on unmount
  // if (triggers.size) {
  //   const unmount = () => {
  //     for (const [name, handler] of triggers.entries()) {
  //       scope.state.bus.unsub([...scope.localPath, name], handler);
  //     }
  //     scope.state.bus.unsub([...scope.localPath, "Unmount"], unmount);
  //   };
  //   scope.state.bus.sub([...scope.localPath, "Unmount"], unmount);
  // }
};

// ============================================================================
// COMPONENTS
// ============================================================================

// --
//
// ## Components
//
// The `Component` class encapsulates an anchor node, a template effector,
// and state context
export class Component {
  constructor(
    id,
    anchor,
    template,
    controller,
    state,
    path,
    slots,
    attributes
  ) {
    this.id = id;
    this.anchor = anchor;
    this.template = template;
    this.state = state;
    this.scope = new EffectScope(
      state,
      path,
      ["@components", template.name, id],
      slots
    );
    // this.scope = new EffectScope(
    //   state,
    //   path || localPath,
    //   localPath,
    //   state.get(path || localPath),
    //   state.get(localPath)
    // );
    this.controller = controller
      ? createController(controller, this.scope)
      : null;
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

const Keys = new Map();

// --
// Takes a DOM node that typically has a `data-ui` attribute, looks for the
// corresponding template in `Templates` and creates a new `Component`
// replacing the given `node` and then rendering the component.
export const createComponent = (
  node,
  state,
  templates = Templates,
  controllers = Controllers
) => {
  // --
  // We retrieve the following attributes:
  // - `data-ui`
  // - `data-path`
  const { ui, path, id } = node.dataset;

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
  const key = id ? id : makeKey(ui);

  const anchor = document.createComment(`${key}|Component|${ui}`);
  const attributes = [...node.attributes].reduce((r, v) => {
    if (!v.name.startsWith("data-")) {
      r.set(v.name, v.value);
    }
    return r;
  }, new Map());

  // TODO: We should probably move the  node to a fragment an render
  // the fragment separately before mounting it, so that we minimize DOM
  // changes.
  node.parentElement.replaceChild(anchor, node);

  return new Component(
    key,
    anchor,
    template,
    controllers.get(ui),
    state,
    path ? path.split(".") : undefined,
    extractSlots(node),
    attributes
  );
};

// EOF
