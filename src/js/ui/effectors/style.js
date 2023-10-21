import { Empty } from "../utils/values.js";
import { Effect } from "../effectors.js";
import { AttributeEffector } from "./attribute.js";

export class StyleEffector extends AttributeEffector {
  constructor(nodePath, selector, name) {
    super(nodePath, selector, name);
    if (name === "style") {
      this.property = null;
    } else {
      this.property = name
        .split("-")
        .slice(1)
        .map((_, i) =>
          i == 0
            ? _.toLowerCase()
            : `${_.charAt(0).toUpperCase()}${_.substring(1)}`
        )
        .join("");
    }
  }
  apply(node, scope) {
    return new StyleEffect(this, node, scope).init();
  }
}
class StyleEffect extends Effect {
  unify(value, previous = this.value) {
    // FIXME: Not sure it should be assign... should probably set the whole thing and remove the ones not set
    if (this.property) {
      if (value === Empty) {
        this.node.style[this.property] = null;
      } else {
        // TODO: We should stringify the property
        this.node.style[this.property] = value;
      }
    } else {
      value === Empty
        ? (this.node.style = null)
        : Object.assign(this.node.style, value);
    }
    return this;
  }
}

// EOF
