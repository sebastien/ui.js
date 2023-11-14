import { Effect, Effector } from "../effectors.js";
import { parsePath } from "../path.js";

export class EventEffector extends Effector {
  // -- doc
  // Creates a new `EventEffector` that  is triggered by the given `event`,
  // generating an event `triggers` (when defined), or
  constructor(nodePath, event, directive, handler = null) {
    super(nodePath, null);
    this.directive = directive;
    this.eventPath = directive.event ? directive.event.split(".") : null;
    this.event = event;
    this.handler = handler;
  }

  apply(node, scope) {
    return new EventEffect(this, node, scope);
  }
}

class EventEffect extends Effect {
  static Value(event) {
    // TODO: Should automatically extract data
    return event.target.value;
  }
  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let { template, path, id } = node.dataset;
      if (template && path !== undefined) {
        return { template, path: parsePath(path), id };
      }
      node = node.parentElement;
    }
    return [null, null];
  }
  constructor(effector, node, scope) {
    super(effector, node, scope);
    const { events, inputs, stops } = this.effector.directive;
    this.handler = (event) => {
      if (inputs) {
        const delta = inputs.reduce((r, input) => {
          console.warn("EVENT:TODO:Delta reduction", input);
          // r[input.key] = input.apply(event);
          return r;
        }, {});
        console.log("EVENT:FIXME:Delta", { delta });
      }
      if (events) {
        const value = EventEffect.Value(event);
        for (const name of events) {
          scope.trigger(name, event, scope, value);
        }
      }
      if (stops) {
        event.preventDefault();
        event.stopPropagation();
      }
      // // If there is a path then we update this based on the value
      // if (destination) {
      //   switch (destination.type) {
      //     case "":
      //       this.scope.patch(destination.path, value);
      //       break;
      //     case ".":
      //       this.scope.patch([...this.scope.path, ...destination.path], value);
      //       break;
      //     default:
      //       onError("effectors.EventEffect: Selector type not supported yet", {
      //         destination,
      //       });
      //       break;
      //   }
      // }
      // if (eventPath) {
      //   // FIXME: We should probably be able to know the template name from
      //   // the scope.
      //   const { template } = EventEffect.FindScope(event.target);
      //   const data = {
      //     name: eventPath.join(""),
      //     event,
      //     scope,
      //   };
      //   // This is a relative event, which then may have local registered handlers
      //   if (eventPath[0] == "") {
      //     this.scope.state.put(
      //       [...scope.localPath, ...eventPath.slice(1)],
      //       data
      //     );
      //   } else {
      //     // TODO: Arguably, we could be using the state tree with events to publish that
      //     // FIXME: If we have a separate bus, we need to explain why in the design.
      //     console.log("TODO: PUBLISH EVENT DISPATCHING", {
      //       template,
      //       eventPath,
      //       data,
      //     });
      //   } }
    };
    node.addEventListener(this.effector.event, this.handler);
  }

  unify(current, previous = this.value) {
    if (current !== previous) {
      console.log("TODO: Event effector unify", { current, previous });
    }
  }

  dispose() {
    this.node.removeEventListener(this.effector.event, this.handler);
  }
}

// EOF
