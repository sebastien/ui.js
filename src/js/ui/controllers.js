import {
  Cell,
  Slot,
  Ref,
  StateCell,
  AtomReducer,
  ArrayReducer,
  MapReducer,
} from "./cells.js";
import { parsePath } from "./paths.js";

// --
// The `Use` class creates a factory object that creates cells.
class Use {
  constructor(cells, scope) {
    this.cells = cells;
    this.scope = scope;
  }

  cell(cell, value = undefined) {
    this.cells.push(cell.bind(this.scope));
    if (value !== undefined) {
      cell.set(value);
    }
    return cell;
  }

  hash(path) {
    return this.cell(new Slot(["@hash", ...parsePath(path)]));
  }

  ref(name) {
    return this.cell(new Ref(name));
  }

  global(path, value = undefined) {
    return this.cell(new Slot(parsePath(path), value));
  }

  // TODO: inputs() returning a proxy
  //
  input(path, value) {
    return this.cell(new Slot([...this.scope.path, ...parsePath(path)], value));
  }

  output(path, value) {
    // NOTE: This is like local

    if (value instanceof Cell) {
      const cell = new StateCell([...this.scope.path, ...parsePath(path)]);
      value.sub((_) => cell.set(_));
      return this.cell(cell, value.value);
    } else {
      return this.cell(
        new Slot([...this.scope.path, ...parsePath(path)], value)
      );
    }
  }

  // TODO: Should deprecate that
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

const onGetHandler = (target, property) => {
  return (handler) => onSetHandler(target, property, handler);
};

const onSetHandler = (target, property, handler) => {
  if (target.has(property)) {
    target.get(property).push(handler);
  } else {
    target.set(property, [handler]);
  }
  return handler;
};

export const Controllers = new Map();
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
  const on = new Proxy(events, { get: onGetHandler, set: onSetHandler });

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

// EOF
