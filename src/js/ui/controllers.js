import { onError } from "./utils/logging.js";
import { items } from "./utils/collections.js";
import { isObject } from "./utils/values.js";
import { ValueError } from "./utils/errors.js";
import {
  Cell,
  Value,
  ValueReducer,
  ListReducer,
  MapReducer,
} from "./reactive.js";

// --
// The `Use` class creates a factory object that creates cells.
class Use {
  constructor(scope) {
    this.cells = [];
    this.scope = scope;
  }

  // --
  // Returns a value cell corresponding to the slot with the given
  // name, creating it if it does not exist. Unlike `local`, this will
  // use cells defined in parent scopes.
  input(name, value = undefined) {
    if (this.scope.slots[name] === undefined) {
      const cell = new Value(value);
      this.cells.push(cell);
      this.scope.slots[name] = cell;
      return cell;
    } else {
      return this.scope.slots[name];
    }
  }

  output(name, cell) {}

  // --
  // Returns a local cell, overriding any cell with the same name defined
  // in the parent scope.
  local(name, value = undefined) {
    if (!this.scope.slots.hasOwnProperty(name)) {
      const cell = new Value(value);
      this.cells.push(cell);
      this.scope.slots[name] = cell;
      return cell;
    } else {
      return this.scope.slots[name];
    }
  }

  derived(inputs, functor) {
    let cell = undefined;
    if (inputs instanceof Cell) {
      cell = new ValueReducer(inputs, functor);
    } else if (inputs instanceof Array) {
      for (const [i, v] of items(inputs)) {
        if (!(v instanceof Cell)) {
          return onError(`Excepted cell for input #${i}`, { cell, inputs });
        }
      }
      cell = new ListReducer(inputs, functor);
    } else if (isObject(inputs)) {
      for (const [i, v] of items(inputs)) {
        if (!(v instanceof Cell)) {
          return onError(`Excepted cell for input #${i}`, { cell, inputs });
        }
      }
      cell = new MapReducer(inputs, functor);
    } else {
      throw ValueError;
    }
    if (cell) {
      this.cells.push(cell);
    }
    return cell;
  }
}
export const Controllers = new Map();

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

class Controller {
  constructor(events, cells) {
    this.events = events;
    this.cells = cells;
  }
}

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
  const use = new Use(scope);

  // Now we run the definition, which should populate the cells and events.
  // TODO: We may want to return something?
  definition({ use, on, scope });

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

  return new Controller(events, use.cells);
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
    // TODO: Here we should look for components that have already been
    // mounted, and then execute the code one them.
  }
  return controller;
};

// EOF
