import { Effector, Effect } from "../effectors.js";
import { bool } from "../utils/values.js";
import { onError } from "../utils/logging.js";

export class IfEffector extends Effector {
	constructor(nodePath, selector, template) {
		super(nodePath, selector);
		if (!template) {
			onError("IfEffector is missing a template", {
				nodePath,
				selector,
				template,
			});
		}
		this.template = template;
	}
	apply(node, scope) {
		return new IfEffect(this, node, scope).init();
	}
}
class IfEffect extends Effect {
	constructor(effector, node, scope) {
		super(effector, node, scope);
		this.state = undefined;
		this.visible = undefined;
	}

	unify(value, previous = this.value) {
		const a = bool(value);
		const b = bool(previous);
		if (previous === undefined || a !== b) {
			if (a) {
				if (this.state === undefined) {
					this.state = this.effector.template.apply(
						this.node,
						this.scope
					);
					// NOTE: Apply already calls init()
				}
				this.visible = true;
				this.state.mount();
			} else {
				if (this.state) {
					this.visible = false;
					this.state.unmount();
					// We'll only dispose of the state when we dispose
					// of the whole effect.
				}
			}
		}
		return this;
	}
	mount() {
		if (this.visible === false) {
			this.visible = true;
			this.state.mount();
		}
		return super.mount();
	}
	unmount() {
		if (this.visible === true) {
			this.visible = false;
			this.state.unmount();
		}
		return super.mount();
	}
	dispose() {
		if (this.visible === true) {
			this.state.unmount();
			this.visible = false;
		}
		if (this.state !== undefined) {
			this.state.dispose();
			this.state = undefined;
			this.visible = undefined;
		}
		return super.dispose();
	}
}
// EOF
