import { Effect, Effector } from "../effectors.js";
import API from "../api.js";

export class EventEffector extends Effector {
	// -- doc
	// Creates a new `EventEffector` that  is triggered by the given `event`,
	// generating an event `triggers` (when defined), or
	constructor(nodePath, event, directive, handler = null, processor = null) {
		super(nodePath, null);
		this.directive = directive;
		this.eventPath = directive.event ? directive.event.split(".") : null;
		this.event = event;
		// The handler takes the event and transforms it in a value that may
		// then be assigned to a slot.
		this.handler = handler;
		// The processor is used when the directive creates an event, and will
		// be used to transform the DOM event into an internal event.
		this.processor = processor;
	}

	apply(node, scope) {
		return new EventEffect(this, node, scope).init();
	}
}

class EventEffect extends Effect {
	constructor(effector, node, scope) {
		super(effector, node, scope);
		this.handler = (...a) => this.handle(...a);
	}

	handle(event) {
		const { handler, processor, directive } = this.effector;
		const v = handler ? handler(event, this.scope, this.node, API) : null;
		// TODO: Do something about that
		if (directive.assign) {
			// NOTE: We update here, meaning that we only create a new slot
			// if ther/s no parent slot.
			if (directive.assign.length === 1) {
				this.scope.update(
					directive.assign[0],
					v,
					directive.force ? true : false,
				);
			} else {
				for (const i in directive.assign) {
					this.scope.update(
						directive.assign[i],
						v ? v[i] : undefined,
						directive.force ? true : false,
					);
				}
			}
		}
		// FIXME: So what's the difference between .slot and .assign?
		if (directive.slot) {
			// NOTE: Likewise, only create if not existins
			this.scope.update(
				directive.slot,
				handler ? v : event.target.value,
				directive.force ? true : false,
			);
		}
		if (directive.event) {
			// NOTE: We use effect scope events, as they're not necessarily in the
			// same layout as the DOM hiererachy
			this.scope.triggerEvent(
				directive.event,
				processor
					? processor(event, this.scope, this.node, API)
					: event,
				this.scope,
				this.node,
				directive.stops ? false : true,
			);
		}
		if (directive.stops) {
			event.stopPropagation();
		}
	}

	unify(current, previous = this.value) {
		if (current !== previous) {
			console.log("TODO: Event effector unify", { current, previous });
		}
	}

	mount() {
		const res = super.mount();
		const { directive, event } = this.effector;
		// FIXME: This is not being called in Outline, but it should
		if (directive.isWebEvent) {
			this.node.addEventListener(event, this.handler);
		} else {
			this.scope.bindEvent(event, this.handler);
		}
		return res;
	}

	unmount() {
		const { directive, event } = this.effector;
		if (directive.isWebEvent) {
			this.node.removeEventListener(event, this.handler);
		} else {
			this.scope.unbindEvent(event, this.handler);
		}

		return super.unmount();
	}
}

// EOF
