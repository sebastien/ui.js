import { composePaths, parsePath, pathNode, pathData } from "./paths.js";
import { CurrentValueSelector } from "./selector.js";
import { patch } from "./state.js";
import { isAtom, isEmpty, onError, numcode } from "./utils.js";
import { Formats, bool, idem } from "./formats.js";
import { Templates } from "./templates.js";

class DOM {
  static after(previous, node) {
    switch (previous.nextSibling) {
      case null:
        previous.parentNode && previous.parentNode.appendChild(node);
        return;
      case node:
        return;
      default:
        previous.parentNode &&
          previous.parentNode.insertBefore(node, previous.nextSibling);
    }
  }
  static mount(parent, node) {
    switch (parent.nodeType) {
      case Node.ELEMENT_NODE:
        node.parentNode !== parent && parent.appendChild(node);
        break;
      default:
        // TODO: Should really be DOM.after, but it breaks the effectors test
        DOM.after(parent, node);
    }
  }
  static unmount(node) {
    node.parentNode?.removeChild(node);
    return node;
  }
}
// --
// ## Effectors
//
//

// -- doc
// The `EffectScope` aggregates a selection in the global state store, of
// both a current value and a local path to store component-level state.
export class EffectScope {
  constructor(state, path, localPath, value = undefined, local = undefined) {
    this.state = state;
    this.path = path;
    this.localPath = localPath;
    this.value = value;
    this.local = local;
  }
}

class EventScope extends EffectScope {
  constructor(scope, event) {
    super(scope.state, scope.path, scope.localPath, event, scope.local);
  }
}

class Effect {
  constructor(effector, node, scope) {
    this.effector = effector;
    this.node = node;
    this.scope = scope;
    this.value = undefined;

    // We apply the selector in the current scope
    if (!effector.selector) {
      onError("Effect(): effector should have a selector", { effector });
    }
    this.selected = effector.selector.apply(scope, this.onChange.bind(this));
    this.abspath = this.selected.abspath;
  }

  bind() {
    this.selected.bind(this.scope);
    return this;
  }

  unbind() {
    this.selected.unbind(this.scope);
    return this;
  }

  init(value = this.scope.value) {
    this.apply(value);
    this.bind();
    return this;
  }

  apply(value) {
    return this.unify(this.selected.extract(value), this.value);
  }

  unify(current, previous = this.value) {
    onError("Effect.unify not implemented", {
      this: this,
      parent: Object.getPrototypeOf(this),
    });
  }

  mount() {}
  unmount() {}

  dispose() {
    this.unmount();
    this.unbind();
  }

  onChange(value, event) {
    // The value is already extracted when `onChange` is called.
    this.unify(value, this.value);
  }
}

export class Effector {
  // -- doc
  //
  // An effector targets the node at the given `nodePath` and selects data
  // using the given `selector`.
  constructor(nodePath, selector) {
    this.nodePath = nodePath;
    this.selector = selector;
    if (!selector) {
      onError("Effector(): Effector has no selector defined", {
        selector,
        nodePath,
      });
    }
  }

  // --
  // An effector is applied when the effect need to be instanciated
  apply(node, value, scope) {
    onError("Effector.apply: no implementation defined", {
      node,
      value,
      scope,
    });
  }
}

// --
// ## Text Effector
//

class TextEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.textNode = document.createTextNode("");
  }

  unify(value, previous = this.value) {
    this.textNode.data =
      value === null || value === undefined
        ? ""
        : typeof value === "string"
        ? value
        : `${value}`;
    if (!this.textNode.parentNode) {
      DOM.mount(this.node, this.textNode);
    }
    return this;
  }

  unmount() {
    // TODO: Should use DOM.mount
    DOM.unmount(this.textNode);
  }
}

class TextEffector extends Effector {
  constructor(nodePath, selector) {
    super(nodePath, selector);
  }
  apply(node, scope) {
    return new TextEffect(this, node, scope).init();
  }
}

// --
// ## Attribute Effector

class AttributeEffect extends Effect {
  unify(value, previous = this.value) {
    this.node.setAttribute(this.effector.name, value);
    return this;
  }
}

export class AttributeEffector extends Effector {
  constructor(nodePath, selector, name) {
    super(nodePath, selector);
    this.name = name;
  }

  apply(node, scope) {
    return new AttributeEffect(this, node, scope).init();
  }
}

// --
// ## Value Effector
//

class ValueEffect extends Effect {
  unify(value, previous = this.value) {
    this.node[this.effector.name] = value;
    return this;
  }
}

export class ValueEffector extends AttributeEffector {
  apply(node, scope) {
    return new ValueEffect(this, node, scope).init();
  }
}

// --
// ## Style Effector
//
class StyleEffect extends Effect {
  unify(value, previous = this.value) {
    Object.assign(this.node.style, value);
    return this;
  }
}
export class StyleEffector extends AttributeEffector {
  apply(node, scope) {
    return new StyleEffect(this, node, scope).init();
  }
}

//  --
// ## Event Effector
//
class EventEffect extends Effect {
  static Value(event) {
    // TODO: Should automatically extract data
    return event.target.value;
  }
  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let { template, path, id } = node.dataset;
      if (template && path !== undefined) {
        return { template, path: parsePath(path), id };
      }
      node = node.parentElement;
    }
    return [null, null];
  }
  constructor(effector, node, scope) {
    super(effector, node, scope);
    const {
      source,
      destination,
      event: triggers,
      stops,
    } = this.effector.directive;
    // TODO: For TodoItem, the path should be .items.0, etc
    this.handler = (event) => {
      const value = source
        ? source.extract(new EventScope(this.scope, event))
        : EventEffect.Value(event);
      // If there is a path then we update this based on the value
      if (destination) {
        switch (destination.type) {
          case "":
            patch(destination.path, value);
            break;
          case ".":
            patch([...this.scope.path, ...destination.path], value);
            break;
          default:
            onError("effectors.EventEffect: Selector type not supported yet", {
              destination,
            });
            break;
        }
      }
      if (triggers) {
        const { template, path, id } = EventEffect.FindScope(event.target);
        // FIXME: Not sure this is correct
        this.scope.state.bus.pub(composePaths([template], triggers), {
          name: triggers,
          path,
          event,
          // The internal state of each template effector is accessible globally.
          state: TemplateEffect.All.get(id)?.state,
        });
      }
      if (stops) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    node.addEventListener(this.effector.event, this.handler);
  }

  dispose() {
    this.node.removeEventListener(this.effector.event, this.handler);
  }
}

export class EventEffector extends Effector {
  // -- doc
  // Creates a new `EventEffector` that  is triggered by the given `event`,
  // generating an event `triggers` (when defined), or
  constructor(nodePath, event, directive) {
    super(nodePath, directive.source);
    this.directive = directive;
    this.event = event;
  }

  apply(node, scope) {
    return new EventEffect(this, node, scope);
  }
}

// --
// ## Slot Effector

class SingleSlotEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.view = undefined;
  }

  unify(current, previous = this.value) {
    if (!this.view) {
      const scope = this.scope;
      const node = document.createComment(
        `⟥─⟤: slot:${this.scope.path.join(".")}`
      );
      DOM.after(this.node, node);
      this.view = this.effector.template
        .apply(
          node, // node
          // NOTE: We may want to include the selector here?
          new EffectScope(
            scope.state,
            this.abspath,
            scope.localPath,
            current,
            scope.local
          )
        )
        .init(current);
      return this.view;
    } else if (current !== previous) {
      this.view.unify(current, previous);
    }
  }
}

class MappingSlotEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.items = undefined;
  }

  // --
  // ### Lifecycle

  unify(current, previous = this.value) {
    // TODO: Abspath should really be just one path, like the root.
    const { node, scope } = this;
    const isCurrentEmpty = isEmpty(current);
    const isPreviousEmpty = isEmpty(previous);
    const isCurrentAtom = isAtom(current);

    // FIXME: This should be moved to the slot effector. We also need
    // to retrieve the key.
    // ### Case: Empty
    if (isCurrentEmpty) {
      if (!isPreviousEmpty && this.items) {
        for (let item of this.items.values()) {
          item.unmount();
          item.dispose();
        }
        this.items?.clear();
      } else {
        // Nothing to do
      }
      // ### Case: Atom
    } else if (isCurrentAtom) {
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
              node, // node
              new EffectScope(
                scope.state,
                // FIXME: Not sure about abspath
                this.abspath ? this.abspath : [],
                scope.localPath,
                current, // value
                scope.local
              ),
              true // isEmpty
            )
          );
        }
      }
      // ### Case: Array
    } else if (current instanceof Array) {
      const items = this.items ? this.items : (this.items = new Map());
      for (let i in current) {
        const item = items.get(i);
        if (!item) {
          items.set(
            i,
            this.createItem(
              node, // node
              new EffectScope(
                scope.state,
                this.abspath ? [...this.abspath, i] : [i],
                scope.localPath,
                current[i], // value
                scope.local
              )
            )
          );
        } else {
          if (!previous || current[i] !== previous[i]) {
            onError("MappingSlotEffect: TODO Should update item", { i });
          }
        }
      }
      // We cleanup any item that is not used anymore
      if (previous) {
        for (let i = current.length; i < (previous.length || 0); i++) {
          const item = items.get(i);
          if (item) {
            item.unmount();
            item.dispose();
          }
          items.delete(i);
        }
      }
      // ### Case: Object
    } else {
      const items = this.items ? this.items : (this.items = new Map());
      for (let k in current) {
        const item = items.get(k);
        if (!item) {
          items.set(
            k,
            this.createItem(
              node, // node
              new EffectScope(
                scope.state,
                this.abspath ? [...this.abspath, k] : [k],
                scope.localPath,
                current[k], // value
                scope.local
              )
            )
          );
        } else {
          if (!previous || current[k] !== previous[k]) {
            onError("MappingSlotEffect: TODO Should update item", { k });
          }
        }
      }
      for (let k in previous) {
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
  createItem(node, scope, isEmpty = false) {
    const root = document.createComment(
      isEmpty
        ? `⟥─⟤: slot:${scope.path.join(".")}`
        : `⟥-[${scope.path.at(-1)}]-⟤: slot:${scope.path
            .slice(0, -1)
            .join(".")}`
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
    return this.effector.template.apply(
      root, // node
      scope
    );
  }
}

// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
export class SlotEffector extends Effector {
  constructor(nodePath, selector, templateName) {
    super(nodePath, selector);
    this.templateName = templateName;
    this._template = !templateName
      ? new TextEffector(nodePath, CurrentValueSelector) // Note: no selector as the slot already took care of it
      : typeof templateName === "string"
      ? undefined
      : templateName;
  }

  // -- doc
  // The effector `template` is lazily resolved, as it may not have been
  // defined at time of declaration.
  get template() {
    const res = this._template
      ? this._template
      : (this._template = Templates.get(this.templateName));
    if (!res) {
      onError(`SlotEffector: Could not find template '${this.templateName}'`, [
        ...Templates.keys(),
      ]);
    }
    return res;
  }

  apply(node, scope) {
    const value = this.selector.extract(scope);
    return new (this.selector.isMany ? MappingSlotEffect : SingleSlotEffect)(
      this,
      node,
      // NOTE: Changing the scope here would distort the value, as we're
      // passing the same selector, so the scope should not change.
      scope
    ).init(value);
  }
}

// --
// ### Conditional Effector

class WhenEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    // FIXME: Not sure the anchor is necessary
    // The anchor will the element where the contents will be re-inserted
    this.anchor = document.createComment(
      `when:${this.effector.selector.toString()}`
    );
    this.contentAnchor = document.createComment(
      `⚓ when:${this.abspath.join(".")}`
    );
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

export class WhenEffector extends SlotEffector {
  constructor(nodePath, selector, templateName, predicate) {
    super(nodePath, selector, templateName);
    this.predicate = predicate;
  }

  apply(node, scope) {
    return new WhenEffect(this, node, scope).init();
  }
}

class MatchEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.states = new Array(this.effector.length);
    this.currentBranchIndex = undefined;
  }

  unify(value, previous = this.value) {
    this.value = value;
    const branches = this.effector.branches;
    let index = undefined;
    let branch = undefined;
    for (let i in branches) {
      branch = branches[i];
      if (value === branch.value) {
        index = i;
        break;
      }
    }
    if (this.states[index] === undefined) {
      // TODO: Scope should be the value at the given path
      const node = this.node.childNodes[branch.nodeIndex];
      this.states[index] = branch.template.apply(node, this.scope);
    }
    if (index !== this.currentBranchIndex) {
      this.states[index].init().mount();
      const previousState = this.states[this.currentBranchIndex];
      if (previousState) {
        previousState.unmount();
      }
      this.currentBranchIndex = index;
    }
    return this;
  }
}

export class MatchEffector extends Effector {
  constructor(nodePath, selector, branches) {
    super(nodePath, selector);
    this.branches = branches;
  }

  apply(node, scope) {
    return new MatchEffect(this, node, scope).init();
  }
}

// --
// ## Template Effector
//

class TemplateEffect extends Effect {
  // We keep a global map of all the template effector states, it's like
  // the list of all components that were created.
  static All = new Map();
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.id = numcode(TemplateEffector.Counter++);
    this.views = [];
    TemplateEffect.All.set(this.id, this);
  }

  unify(value, previous = this.value) {
    const template = this.effector.template;
    // This should really be called only once, when the template is expanded.
    if (this.views.length != template.views.length) {
      // Creates nodes and corresponding effector states for each template
      // views.
      while (this.views.length < template.views.length) {
        this.views.push(undefined);
      }
      for (let i = 0; i < template.views.length; i++) {
        if (!this.views[i]) {
          const view = template.views[i];
          const root = view.root.cloneNode(true);
          // We update the `data-template` and `data-path` attributes, which is
          // used by `EventEffectors` in particular to find the scope.
          if (root.nodeType === Node.ELEMENT_NODE) {
            root.dataset["template"] =
              this.effector.rootName || this.effector.name;
            root.dataset["path"] = this.scope.path
              ? this.scope.path.join(".")
              : "";
            root.dataset["id"] = this.id;
          }
          // We do need to mount the node first, as the effectors may need
          // the nodes to have a parent.
          // This mounts the view on the parent
          // Now we create instances of the children effectors.
          const nodes = [];
          const states = [];
          DOM.after(i === 0 ? this.node : this.views[i - 1].root, root);
          if (!root.parentNode) {
            onError(
              "TemplateEffect: view root node should always have a prent",
              { i, root, view }
            );
          }
          for (let i in view.effectors) {
            const effector = view.effectors[i];
            const node = pathNode(effector.nodePath, root);
            const effect = effector.apply(node, this.scope);
            states.push(effect);
            // NOTE: We do that as the effect MAY (but probably should not)
            // manipulate the given node.
            nodes.push(effect.node);
          }
          // We add the view, which will be collected in the template effector.
          this.views[i] = {
            root,
            nodes,
            states,
          };
        }
      }
      this.mount();
    }
  }

  mount() {
    super.mount();
    const n = this.views.length;
    let previous = this.node;
    for (let i = 0; i < n; i++) {
      const node = this.views[i].root;
      if (node) {
        DOM.after(previous, node);
        previous = node;
      }
    }
  }

  unmount() {
    for (let view of this.views) {
      view.root?.parentNode?.removeChild(view.root);
    }
  }

  dispose() {
    super.dispose();
    for (let view of this.views) {
      for (let state of view.states) {
        state?.dispose();
      }
    }
    this.views = [];
    TemplateEffect.All.delete(this.id, this);
  }
}

export class TemplateEffector extends Effector {
  // -- doc
  // Counts the number of template effectors created, this is the used
  // to assign the `data-scope` attribute.
  static Counter = 0;

  constructor(template, rootName = undefined) {
    // TODO: We may want path a different selector there.
    super(null, CurrentValueSelector);
    this.template = template;
    this.name = template.name;
    this.rootName = rootName;
  }

  apply(node, scope) {
    return new TemplateEffect(this, node, scope).init();
  }
}

// EOF
