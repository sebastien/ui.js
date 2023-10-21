import { Effect } from "../effectors.js";
import { SlotEffector } from "./slot.js";

export class WhenEffector extends SlotEffector {
  constructor(nodePath, selector, templateName, predicate) {
    super(nodePath, selector, templateName);
    this.predicate = predicate;
  }

  apply(node, scope) {
    return new WhenEffect(this, node, scope).init();
  }
}

class WhenEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    // The anchor will the element where the contents will be re-inserted
    //
    // FIXME: Not sure the anchor is necessary
    // TODO: Should have better names
    this.anchor = createComment(`WhenEffect`);
    this.contentAnchor = createComment(`WhenEffect:Content`);
    this.displayValue = node?.style?.display;
    this.node.appendChild(this.contentAnchor);
    // FIXME: Not sure why this is necessary. We should not change the node
    // here as it will cause problem in other effeects, as this will in effect
    // replace the root node of the view.
    // this.node.parentNode.replaceChild(this.anchor, node);
    this.state = null;
  }

  unify(value, previous = this.value) {
    if (previous === undefined || value !== previous) {
      this.effector.predicate(value) ? this.show(value) : this.hide();
    }
    this.value = value;
    return this;
  }

  show(value) {
    if (!this.state) {
      this.state = this.effector.template.apply(this.contentAnchor, this.scope);
    } else {
      this.state.unify(value);
      this.state.mount();
    }
    if (this.node.style) {
      this.node.style.display = this.displayValue;
    } else {
      // These may be other kind of nodes, probably not visible (ie, comments)
      onError("WhenEffect.show: Node has no style", {
        node: this.node,
        value,
      });
    }

    if (!this.node.parentNode) {
      DOM.mount(this.anchor, this.node);
    }

    return this;
  }

  hide() {
    if (this.node.style) {
      this.node.style.display = "none";
    } else {
      // These may be other kind of nodes, probably not visible (ie, comments)
    }
    if (this.state) {
      this.state.unmount();
    }
  }
}
