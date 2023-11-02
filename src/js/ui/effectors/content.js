import { Effect, Effector } from "../effectors.js";
import { DOM } from "../utils/dom.js";
import { Empty } from "../utils/values.js";

export class ContentEffector extends Effector {
  constructor(nodePath, selector, placeholder = undefined, bindings) {
    super(nodePath, selector);
    this.placeholder = placeholder;
  }
  apply(node, scope) {
    return new ContentEffect(this, node, scope).init();
  }
}

class ContentEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.textNode = document.createTextNode("");
    this.contentNode = undefined;
    this._placeholder = undefined;
  }

  // --
  // Lazily clones the placeholder, if it is defined.
  get placeholder() {
    const fragment = this.effector.placeholder;
    if (fragment && !this._placeholder) {
      const placeholder = [];
      for (let i = 0; i < fragment.childNodes.length; i++) {
        placeholder.push(fragment.childNodes[i].cloneNode(true));
      }
      this._placeholder = placeholder;
    }
    return this._placeholder;
  }

  unify(value, previous = this.value) {
    console.log("XXX CONTENT EFF", { value, previous });
    const placeholder = this.placeholder;
    const isEmpty = value === Empty || value === null || value === undefined;
    if (isEmpty) {
      this.textNode.data = "";
    } else if (value instanceof DocumentFragment) {
      if (this.contentNode) {
        DOM.unmount(this.contentNode);
      }
      this.contentNode = [...value.childNodes];
      this.textNode.data = "";
    } else if (value instanceof Node) {
      if (this.contentNode && value !== this.contentNode) {
        DOM.replace(this.contentNode, value);
      }
      this.contentNode = value;
      this.textNode.data = "";
    } else {
      DOM.unmount(this.contentNode);
      this.textNode.data =
        value === Empty || value === null || value === undefined
          ? ""
          : typeof value === "string"
          ? value
          : `${value}`;
    }

    if (!this.textNode.parentNode) {
      DOM.mount(this.node, this.textNode);
    }
    if (this.contentNode && !this.contentNode.parentNode) {
      DOM.mount(this.node, this.contentNode);
    }

    // We mount/unmount the placeholder, if there's one.
    if (placeholder)
      if (isEmpty) {
        let previous = this.textNode;
        for (const node of placeholder) {
          DOM.after(previous, node);
          previous = node;
        }
      } else {
        for (const node of placeholder) {
          DOM.unmount(node);
        }
      }
    return this;
  }

  unmount() {
    // TODO: Should use DOM.mount
    DOM.unmount(this.textNode);
  }
}

// EOF
