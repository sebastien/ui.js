import { onError } from "../utils/logging.js";
import { isEmpty, isAtom } from "../utils/values.js";
import { DOM, createComment } from "../utils/dom.js";
import { Effector, Effect } from "../effectors.js";
import { Selector } from "../selector.js";
import { Templates } from "../templates.js";

//
// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
export class SlotEffector extends Effector {
  constructor(nodePath, selector, templateName, handlers, bindings) {
    super(nodePath, selector);
    // TODO: Selectors for slots should not have a format, slots pass
    // down the value directly to a template.
    //
    // The handlers map event names to the path at which the incoming
    // events should be stored/relayed.
    this.handlers = handlers;
    this.bindings = bindings;
    // Note that template name can also be a selector here.
    this.templateName = templateName;
    if (!templateName) {
      onError(
        `SlotEffector: template is not specified, use ContentEffector instead`,
        { nodePath, selector }
      );
    } else if (typeof templateName === "string") {
      // TODO: We should replace these by Enum
      this.templateType = "str";
      this._template = undefined;
    } else if (templateName instanceof Selector) {
      this.templateType = "sel";
      this._template = undefined;
    } else if (templateName instanceof Effector) {
      this.templateType = "eff";
      this._template = templateName;
    } else {
      onError("SlotEffector: template should be string, selector or effector", {
        template: templateName,
      });
    }
  }

  // -- doc
  // The effector `template` is lazily resolved, as it may not have been
  // defined at time of declaration.
  get template() {
    if (this._template) {
      return this._template;
    } else {
      switch (this.templateType) {
        case "str":
          this._template =
            Templates.get(this.templateName) ||
            onError(
              `SlotEffector: Could not find template '${this.templateName}'`,
              [...Templates.keys()]
            );
          break;
        case "eff":
          this._template = this.templateName;
          break;
        default:
      }
      return this._template;
    }
  }

  apply(node, scope) {
    // NOTE: We leave the scope unchanged here
    const effect = new (this.selector.isMany
      ? MappingSlotEffect
      : SingleSlotEffect)(this, node, scope, this.template).init();
    return this.templateType === "sel"
      ? new DynamicTemplateEffect(
          this,
          node,
          scope,
          this.templateName,
          effect
        ).init()
      : effect;
  }
}

// --
// This wraps another effect and changes the template.
class DynamicTemplateEffect extends Effect {
  constructor(effector, node, scope, templateSelector, effect) {
    super(effector, node, scope, templateSelector);
    templateSelector instanceof Selector ||
      onError(
        "DynamicTemplateEffect: template selector is not a Selector instance",
        { templateSelector, effector, node, scope }
      );
    this.effect = effect;
  }

  resolveTemplate(template) {
    const res =
      typeof template === "string"
        ? Templates.get(template)
        : template instanceof Effector
        ? template
        : null;
    res ||
      onError(
        `DynamicTemplateEffect: unable to resolve template '${template}'`,
        { template }
      );
    return res;
  }

  apply() {
    return this.unify(this.resolveTemplate(this.selection.value));
  }

  unify(current, previous = this.value) {
    if (current !== previous) {
      this.value = current;
      // The template has changed
      this.effect.dispose();
      this.effect.template = current;
      this.effect.apply();
    }
  }
}

// This is the generic, abstract version of a slot effect. This is
// specialized by `SingleSlotEffect` and `MultipleSlotEffect`.
class SlotEffect extends Effect {
  constructor(effector, node, scope, template) {
    super(effector, node, scope);
    this.handlers = {};
    this.template = template;
  }
  bind() {
    super.bind();
    const scope = this.scope;
    const handlers = this.effector.handlers;
    // FIXME: We should put this back and explain
    // const parentLocalPath = this.parentLocalPath;
    // if (handlers) {
    //   for (const k in handlers) {
    //     const targetPath = composePaths(parentLocalPath, handlers[k]);
    //     // We relay the event from the subscribed path to the parent path.
    //     const h = (event) => {
    //       scope.state.put(targetPath, event);
    //     };
    //     this.handlers[k] = h;
    //     scope.state.sub([...scope.localPath, k], h);
    //   }
    // }
  }
  unbind() {
    const res = super.unbind();
    const scope = this.scope;
    // FIXME: Implement this back
    // for (const k in this.handlers) {
    //   const p = [...scope.localPath, k];
    //   scope.state.sub(p, this.handlers[k]);
    // }
    return res;
  }
}

class SingleSlotEffect extends SlotEffect {
  constructor(effector, node, scope, template) {
    super(effector, node, scope, template);
    this.view = undefined;
  }

  unify(current, previous = this.value) {
    console.log("XXX UNIFY/single", { current, previous });
    if (!this.view) {
      const node = createComment(
        // FIXME: add a better description of that part
        `_|SingleSlotEffect`
      );
      DOM.after(this.node, node);

      // TODO: We should only derive a scope if we have bindings there
      // if (this.effector.bindings) {
      //   scope.updateLocal(this.effector.bindings);
      // }

      console.log("TEMPLATE", this.template);
      this.view = this.template
        ?.apply(
          node, // node
          this.scope
        )
        ?.init();
      return this.view;
    } else if (current !== previous) {
      this.view.unify(current, previous);
    }
  }
}

// --
// Implements the mapping of a slot for each item of a collection.
class MappingSlotEffect extends SlotEffect {
  constructor(effector, node, scope, template) {
    super(effector, node, scope, template);
    // FIXME: This may not be necessary anymore
    // We always go through a change
    // this.selection.alwaysChange = true;
    this.items = undefined;
  }

  // --
  // ### Lifecycle

  unify(current, previous = this.value) {
    console.log("XXXX UNIFY/mapping", { current, previous });
    // We prepare from comparing the current state with the previous state,
    // and do the corresponding operations to unify.
    const { node, scope } = this;
    const isCurrentEmpty = isEmpty(current);
    const isPreviousEmpty = isEmpty(previous);
    const isCurrentAtom = isAtom(current);

    const path = this.effector.selector.path;

    // FIXME: This should be moved to the slot effector. We also need
    // to retrieve the key.
    // ### Case: Empty
    if (isCurrentEmpty) {
      if (!isPreviousEmpty && this.items) {
        for (const item of this.items.values()) {
          item.unmount();
          item.dispose();
        }
        this.items?.clear();
      } else {
        // Nothing to do
      }
    } else if (isCurrentAtom) {
      // ### Case: Atom
      const items = this.items ? this.items : (this.items = new Map());
      if (current !== previous) {
        const item = items.get(null);
        if (item) {
          // Nothing to do, the item effectors will already be subscribed
          // to the change.
        } else {
          items.set(
            null,
            this.createItem(
              this.template,
              node, // node
              scope.derive(path), // scope
              true // isEmpty
            )
          );
        }
      }
    } else if (current instanceof Array) {
      // ### Case: Array
      const items = this.items ? this.items : (this.items = new Map());
      for (let i = 0; i < current.length; i++) {
        const item = items.get(i);
        if (!item) {
          items.set(
            i,
            this.createItem(
              this.template,
              node, // node
              // FIXME: We probably want to change the local path
              scope.derive([...path, i], scope.localPath, scope.slots, i),
              undefined,
              i
            )
          );
        } else {
          if (!previous || current[i] !== previous[i]) {
            item.apply();
          } else {
            // No change in item
          }
        }
      }
      // We cleanup any item that is not used anymore
      let j = current.length;
      let item = null;
      while ((item = items.get(j))) {
        item.unmount();
        item.dispose();
        items.delete(j);
        j++;
      }
    } else {
      // ### Case: Object
      const items = this.items ? this.items : (this.items = new Map());
      for (const k in current) {
        const item = items.get(k);
        if (!item) {
          items.set(
            k,
            this.createItem(
              this.template,
              node, // node
              // FIXME: We probably want to change the local path
              scope.derive([...path, k], scope.localPath, scope.slots, k),
              undefined,
              k
            )
          );
        } else {
          if (!previous || current[k] !== previous[k]) {
            item.apply();
          }
        }
      }
      for (const k of items.keys()) {
        if (current[k] === undefined) {
          const item = items.get(k);
          if (item) {
            item.unmount();
            item.dispose();
          }
          this.items.delete(k);
        }
      }
    }
    this.value = current;
    return this;
  }

  // -- doc
  // Creates a new item node in which the template can be rendered.
  createItem(template, node, scope, isEmpty = false, key = undefined) {
    // TODO: Should have a better comment
    const root = createComment(
      `out:content=${this.effector.selector.toString()}#${key || 0}`
    );
    // We need to insert the node before as the template needs a parent
    if (!node.parentNode) {
      onError("MappingSlotEffect.createItem: node has no parent element", {
        node,
        value: scope.value,
        path: scope.path,
      });
    } else {
      // TODO: Should use DOM.after
      node.parentNode.insertBefore(root, node);
    }
    return template
      ? template.apply(
          root, // node
          scope
        )
      : null;
  }
}

// EOF
