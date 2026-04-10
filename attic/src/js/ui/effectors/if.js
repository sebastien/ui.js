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
		this.visible = false;
	}

	unify(value, previous = this.value) {
		const a = bool(value);
		const b = bool(previous);

		if (previous === undefined || a !== b) {
			if (a) {
				// The branch is visible
				if (this.state === undefined) {
					this.state = this.effector.template.apply(
						this.node,
						this.scope,
					);
					// NOTE: Apply already calls init()
				}
				!this.state.bound && this.state.bind();
				!this.state.mounted && this.state.mount();
				this.visible = true;
			} else {
				// The branch is not visible
				this.state?.bound && this.state.unbind();
				this.state?.mounted && this.state.unmount();
				// We'll only dispose of the state when we dispose
				// of the whole effect.
				this.visible = false;
			}
		}

		return this;
	}
	mount() {
		if (this.state?.mounted === 0 && this.visible) {
			this.state.mount();
		}
		return super.mount();
	}

	unmount() {
		if (this.state?.mounted) {
			this.state?.unmount();
		}
		return super.unmount();
	}

	dispose() {
		if (this.state?.mounted) {
			this.state?.unmount();
		}
		this.state?.dispose();

		this.state = undefined;
		this.visible = undefined;
		return super.dispose();
	}
}
// EOF
