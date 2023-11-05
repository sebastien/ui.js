import { onError } from "./utils/logging.js";

// --
// The `Use` class creates a factory object that creates cells.
class Use {}
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
  const cells = [];
  const use = new Use(cells, scope);

  // Now we run the definition, which should populate the cells and events.
  // TODO: We may want to return something?
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

  return new Controller(events, cells);
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
