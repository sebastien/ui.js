import { Effect, Effector } from "../effectors.js";
import { Empty } from "../utils/values.js";

export class AttributeEffector extends Effector {
	constructor(nodePath, selector, name) {
		super(nodePath, selector);
		this.name = name;
	}

	apply(node, scope) {
		return new AttributeEffect(this, node, scope).init();
	}
}

class AttributeEffect extends Effect {
	constructor(...args) {
		super(...args);
		// TODO: We should detect which is first, so that we can preserve the roder
		this.existing = this.node.getAttribute(this.effector.name);
	}

	unify(value, previous = this.value) {
		if (value === Empty || value == undefined || value === null) {
			this.existing
				? this.node.setAttribute(this.effector.name, this.existing)
				: this.node.removeAttribute(this.effector.name);
		} else {
			this.node.setAttribute(
				this.effector.name,
				this.existing ? `${this.existing} ${value}` : value
			);
		}
		return this;
	}
}

// EOF
