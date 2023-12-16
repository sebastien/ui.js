import { Effect, Effector } from "../effectors.js";
import { API } from "../reactive.js";

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
		const { handler, directive } = this.effector;
		const v = handler ? handler(event, this.scope, this.node, API) : null;
		// TODO: Do something about that
		if (directive.assign) {
			this.scope.set(directive.assign, v, directive.force ? true : false);
		}
		if (directive.slot) {
			this.scope.set(
				directive.slot,
				handler ? v : event.target.value,
				directive.force ? true : false
			);
		}
		if (directive.event) {
			// NOTE: We use effect scope events, as they're not necessarily in the
			// same layout as the DOM hiererachy
			this.scope.triggerEvent(
				directive.event,
				event,
				this.scope,
				this.node,
				directive.stops ? false : true
			);
		}
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
