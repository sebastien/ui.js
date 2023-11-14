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
  unify(value, previous = this.value) {
    console.log("ATTR", this.effector.name, "=", { value: value });
    if (value === Empty || value == undefined || value === null) {
      this.node.removeAttribute(this.effector.name);
    } else {
      this.node.setAttribute(this.effector.name, value);
    }
    return this;
  }
}

// EOF
