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
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.handler = (...a) => this.handle(...a);
    node.addEventListener(this.effector.event, this.handler);
  }

  handle(event) {
    const h = this.effector.handler;
    const v = h ? h(event, this.scope, this.node) : null;
    // TODO: Do something about that
    console.log("HANDLING", { event, handler: h, scope: this.scope, value: v });
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
