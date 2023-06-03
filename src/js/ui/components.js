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

  get value() {
    throw new Error("Cell.value not implemented", { cell: this });
  }

  unbind() {
    throw new Error("Cell.unbind not implemented", { cell: this });
  }
}

export class Ref extends Cell {
  constructor(name) {
    super();
    this.name = name;
  }
}

export class Slot extends Cell {
  constructor(path) {
    super();
    this.path = path;
  }

  get topic() {
    return this.scope.state.bus.get(this.path);
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
}

class AtomReducer extends Reducer {
  constructor(inputs, functor) {
    super(inputs, functor, undefined, (...args) =>
      this.onInputChange(null, ...args)
    );
  }

  bind(scope) {
    super.bind(scope);
    scope.state.bus.sub(this.inputs.path, this.handlers);
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
    for (const i in this.inputs) {
      scope.state.bus.sub(this.inputs[i].path, this.handlers[i]);
    }
  }

  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this._value = this.functor(...this.input);
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
    for (const [key, cell] of Object.entries(this.inputs)) {
      scope.state.bus.sub(cell.path, this.handlers[key]);
    }
  }
  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this._value = this.functor(this.input);
    }
  }
}

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

  global(path) {
    return this.cell(new Slot(parsePath(path)));
  }

  local(path) {
    return this.cell(new Slot([...this.scope.localPath, ...parsePath(path)]));
  }

  reduce(inputs, functor) {
    return this.cell(
      inputs instanceof Cell
        ? new AtomReducer(inputs, functor)
        : inputs instanceof Array
        ? new ArrayReducer(inputs, functor)
        : new MapReducer(inputs, functor)
    );
  }
}
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
  const cells = [];
  const events = new Map();
  const on = new Proxy(events, { get: onHandler });
  const use = new Use(cells, scope);
  definition({ use, on });

  // We process the event handlers
  const triggers = new Map();
  for (const [name, handlers] of events.entries()) {
    const eventName = `${name.charAt(0).toUpperCase()}${name.substring(1)}`;
    const trigger = () => {
      for (const handler of handlers) {
        handler();
      }
    };
    if (eventName === "Mount") {
      trigger();
    } else {
      scope.state.bus.sub([...scope.localPath, eventName], trigger);
      triggers.set(eventName, trigger);
    }
  }

  // If we registered handlers, then we unmount them on unmount
  if (triggers.size) {
    const unmount = () => {
      for (const [name, handler] of triggers.entries()) {
        scope.state.bus.unsub([...scope.localPath, name], handler);
      }
      scope.state.bus.unsub([...scope.localPath, "Unmount"], unmount);
    };
    scope.state.bus.sub([...scope.localPath, "Unmount"], unmount);
  }
};

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
    const localPath = ["@local", this.id];
    if (slots) {
      state.patch(localPath, slots);
    }
    this.scope = new EffectScope(
      state,
      path || localPath,
      localPath,
      state.get(path || localPath),
      state.get(localPath)
    );
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

  // TODO: We should probably move the  node to a fragment an render
  // the fragment separately before mounting it, so that we minimize DOM
  // changes.
  node.parentElement.replaceChild(anchor, node);

  return new Component(
    id,
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
