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
  }

  unify(value, previous = this.value) {
    const a = bool(value);
    const b = bool(previous);
    if (previous === undefined || a !== b) {
      if (a) {
        if (this.state === undefined) {
          this.state = this.effector.template.apply(this.node, this.scope);
          this.state.init();
        }
        this.state.mount();
      } else {
        if (this.state) {
          this.state.unmount();
          // TODO: We may want to deinit?
        }
      }
    }
    return this;
  }
}
// EOF
