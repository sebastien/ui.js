import { onError } from "./utils/logging.js";
import { Value } from "./reactive.js";

// --
// The `Use` class creates a factory object that creates cells.
class Use {
	constructor(scope) {
		this.cells = [];
		this.scope = scope;
	}

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

	// --
	// Returns a value cell corresponding to the slot with the given
	// name, creating it if it does not exist. Unlike `local`, this will
	// use cells defined in parent scopes.
	input(name, value = undefined) {
		console.warn("Deprecated");
		if (this.scope.slots[name] === undefined) {
			const cell = new Value(value, name);
			this.cells.push(cell);
			this.scope.slots[name] = cell;
			return cell;
		} else {
			return this.scope.slots[name];
		}
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

class EventProxy {
	static get(target, property) {
		return (handler) => EventProxy.set(target, property, handler);
	}

	static set(target, property, handler) {
		if (target.has(property)) {
			target.get(property).push(handler);
		} else {
			target.set(property, [handler]);
		}
		return handler;
	}
}

class StateProxy {
	static get(scope, property) {
		// FIXME: We should probably return something that manipulates the state at and
		// given path
		// NOTE: We use `_` as we can't have `_` in the name.
		return scope.get(property.split("_"));
	}
	static set(scope, property, value) {
		scope.update(property.split("_"), value);
		return true;
	}
}

class Controller {
	constructor(events, cells) {
		this.events = events;
		this.cells = cells;
	}
	// TODO: Trigger?
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
	const declared = {};

	// `use` wraps the cells and scope const use = new Use(scope);

	// Now we run the definition, which should populate the cells and events.
	// TODO: We may want to return something?
	definition(
		new Proxy(declared, {
			get: (_, property) => {
				switch (property) {
					case "use":
						// FIXME: Is this really deprecated? We should make sure
						// we cover the use cases properly.
						console.warn("[uijs/controllers] use() is deprecated");
						declared.use = new Use(scope);
						return declared.use;
					case "on":
						declared.events = new Map();
						declared.on = new Proxy(declared.events, EventProxy);
						return declared.on;
					case "state":
						declared.state = new Proxy(scope, StateProxy);
						return declared.state;
					case "scope":
						return scope;
					default:
						throw new Error(
							`Unexpected controller argument: ${property}`
						);
				}
			},
		})
	);

	// We process the event handlers
	// for (const [name, handlers] of events.entries()) {
	//   const eventName = `${name.charAt(0).toUpperCase()}${name.substring(1)}`;
	//   scope.handlers.set(
	//     eventName,
	//     (scope.handlers.get(eventName) || []).concat(handlers)
	//   );
	//   // if (eventName === "Mount") {
	//   //   console.log("MOUNT", eventName);
	//   //   trigger(scope);
	//   // } else {
	//   //   console.log("HANDLER", { eventName });
	//   //   // scope.state.bus.sub([...scope.localPath, eventName], trigger);
	//   //   triggers.set(eventName, trigger);
	//   // }
	// }

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

	return new Controller(declared?.events, declared?.use?.cells);
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
