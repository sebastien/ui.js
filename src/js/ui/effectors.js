import { composePaths, parsePath, pathNode, pathData } from "./paths.js";
import { Bus, sub, unsub, pub } from "./pubsub.js";
import { CurrentValueSelector } from "./selector.js";
import { patch } from "./state.js";
import { isAtom, isEmpty, onError, numcode } from "./utils.js";
import { Formats, bool, idem } from "./formats.js";
import { Templates } from "./templates.js";

// --
// ## Effectors
//
//

class Effect {
  constructor(effector, node, value, global, local, path) {
    this.effector = effector;
    this.node = node;
    this.global = global;
    this.local = local;
    this.path = path;

    // We apply the selector in the current scope
    if (!effector.selector) {
      onError("Effect(): effector should have a selector", { effector });
    }
    this.selected = effector.selector.apply(
      value,
      global,
      local,
      path,
      this.onChange.bind(this)
    );
  }

  bind(bus = Bus, path = this.path) {
    this.selected.bind(bus, path);
    return this;
  }

  unbind(bus = Bus, path = this.path) {
    this.selected.unbind(bus, path);
    return this;
  }

  onChange(value) {
    this.apply(value);
  }

  init(value) {
    this.apply(this.selected.apply(value, this.global, this.local, this.path));
    this.selected.bind(Bus, this.path);
    return this;
  }

  apply(value) {}

  mount() {}
  unmount() {}

  dispose() {
    this.selected.unbind(Bus, this.path);
  }
}

export class Effector {
  // -- doc
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
      debugger;
    }
  }

  // --
  // An effector is applied when the effect need to be instanciated
  apply(node, value, global, local, path = undefined) {
    onError("Effector.apply: no implementation defined", {
      node,
      value,
      global,
      local,
    });
  }
}

// --
// ## Text Effector
//

class TextEffect extends Effect {
  constructor(effector, node, value, global, local, path) {
    super(effector, node, value, global, local, path);
    this.textNode = document.createTextNode("");
  }

  apply(value) {
    this.textNode.data =
      value === null || value === undefined
        ? ""
        : typeof value === "string"
        ? value
        : `${value}`;
    if (!this.textNode.parentElement) {
      this.node.parentElement.insertBefore(this.textNode, this.node);
    }
    return this;
  }

  unmount() {
    this.textNode.parentElement?.removeChild(this.textNode);
  }
}

class TextEffector extends Effector {
  apply(node, value, global, local, path = undefined) {
    return new TextEffect(this, node, value, global, local, path).init(value);
  }
}

// --
// ## Attribute Effector

class AttributeEffect extends Effect {
  apply(value) {
    this.node.setAttribute(this.effector.name, value);
    return this;
  }
}

export class AttributeEffector extends Effector {
  constructor(nodePath, selector, name) {
    super(nodePath, selector);
    this.name = name;
  }

  apply(node, value, global, local, path = undefined) {
    return new AttributeEffect(this, node, value, global, local, path).init(
      value
    );
  }
}

// --
// ## Value Effector
//

class ValueEffect extends Effect {
  apply(value) {
    this.node[this.effector.name] = value;
    return this;
  }
}

export class ValueEffector extends AttributeEffector {
  apply(node, value, global, local, path = undefined) {
    return new ValueEffect(this, node, value, global, local, path).init(value);
  }
}

// --
// ## Style Effector
//
class StyleEffect extends Effect {
  apply(value) {
    Object.assign(this.node.style, value);
    return this;
  }
}
export class StyleEffector extends AttributeEffector {
  apply(node, value, global, local, path = undefined) {
    return new StyleEffect(this, node, value, local, global, path).init(value);
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
  constructor(effector, node, value, global, local, path) {
    super(effector, node, value, global, local, path);
    const {
      source,
      destination,
      event: triggers,
      stops,
    } = this.effector.directive;
    // TODO: For TodoItem, the path should be .items.0, etc
    this.handler = (event) => {
      const value = source ? source.extract(event) : EventEffect.Value(event);
      // If there is a path then we update this based on the value
      if (destination) {
        switch (destination.type) {
          case "":
            patch(destination.path, value);
            break;
          case ".":
            patch(composePaths(path, destination.path), value);
            break;
          default:
            console.warn("Selector type not supported yet", { destination });
            break;
        }
      }
      if (triggers) {
        const { template, path, id } = EventEffector.FindScope(event.target);
        console.log("FOUND", { template, path, id });
        // const { template, path, id } = EventEffector.FindScope(event.target);
        // pub(composePaths([template], name), {
        //   name,
        //   path,
        //   event,
        //   // The internal state of each template effector is accessible globally.
        //   state: TemplateEffect.All.get(id)?.state,
        // });
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

  apply(node, value, global, local, path = undefined) {
    return new EventEffect(this, node, value, global, local, path);
  }
}

// --
// ## Slot Effector
//
class SlotEffect extends Effect {
  constructor(effector, node, value, global, local, path) {
    super(effector, node, value, global, local, path);
    this.previous = undefined;
    this.items = undefined;
  }

  apply(value = this.value) {
    return this.unify(value, this.previous);
  }

  createItem(node, value, global, local, path, isEmpty = false) {
    const root = document.createComment(
      `slot:${isEmpty ? "null" : path.at(-1)}`
    );
    // We need to insert the node before as the template needs a parent
    node.parentElement.insertBefore(root, node);
    return this.effector.template.apply(
      root, // node
      value,
      global,
      local,
      path
    );
  }

  // --
  // ### Lifecycle
  onChange(value, event) {
    // console.log("Slot.onChange", { value, previous: this.previous, event });
    this.unify(value);
  }

  unify(current, previous = this.previous, path = this.path) {
    const { node, global, local } = this;
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
        this.item.clear();
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
              current, // value
              global,
              local,
              path ? path : [], // path
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
              current[i], // value
              global,
              local,
              path ? [...path, i] : [i] // path
            )
          );
        } else {
          if (!previous || current[i] !== previous[i]) {
            console.log("TODO Should update item", i);
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
              current[k], // value
              global,
              local,
              path ? [...path, k] : [k] // path
            )
          );
        } else {
          if (!previous || current[k] !== previous[k]) {
            console.log("TODO Should update item", k);
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
    this.previous = current;
    return this;
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

  apply(node, value, global, local, path = undefined) {
    return new SlotEffect(this, node, value, global, local, path).init(value);
  }
}

// --
// ### Conditional Effector

class ConditionalEffect extends Effect {
  constructor(effector, node, value, global, local, path) {
    super(effector, node, value, global, local, path);
    this.anchor = document.createComment(
      `when:${this.effector.selector.toString()}`
    );
    // NOTE: We may want to always insert before
    node.nodeType !== Node.ELEMENT_NODE
      ? node.parentElement.insertBefore(this.anchor, node)
      : node.appendChild(this.anchor);
    this.displayValue = node?.style?.display;
    this.state = null;
  }

  apply(value = this.value) {
    const { global, local, path } = this;
    const extracted = this.effector.selector.extract(
      value,
      global,
      local,
      path
    );
    // TODO: We should detect if there was a change
    return this.effector.predicate(extracted) ? this.show(value) : this.hide();
  }

  show(value) {
    if (!this.state) {
      this.state = this.effector.template.apply(
        this.anchor,
        value,
        this.global,
        this.local,
        this.path
      );
    } else {
      this.state.update(value);
      this.state.mount();
    }
    if (this.node.style) {
      this.node.style.display = this.displayValue;
    } else {
      // These may be other kind of nodes, probably not visible (ie, comments)
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

export class ConditionalEffector extends SlotEffector {
  constructor(nodePath, selector, templateName, predicate) {
    super(nodePath, selector, templateName);
    this.predicate = predicate;
  }

  apply(node, value, global, local, path = undefined) {
    return new ConditionalEffect(this, node, value, global, local, path).apply(
      value
    );
  }
}

// --
// ## Template Effector
//

class TemplateEffect extends Effect {
  // We keep a global map of all the template effector states, it's like
  // the list of all components that were created.
  static All = new Map();
  constructor(effector, node, value, path, views, id) {
    super(effector, node, value, path);
    this.views = views;
    this.id = id;
    // NOTE: Not sure this is necessary
    // this.data = {};
    // this.state = new Proxy(this.data, {
    //   set: (target, prop, value) => {
    //     target[prop] = value;
    //     return value;
    //   },
    //   get: (target, prop, receiver) =>
    //     prop === "update"
    //       ? this.updateState.bind(this)
    //       : prop in target
    //       ? target[prop]
    //       : undefined,
    // });
    TemplateEffect.All.set(id, this);
  }

  // TODO: Should describe when/why this is used
  // updateState(items) {
  //   for (let k in items) {
  //     this.data[k] = items[k];
  //   }
  //   return items;
  // }

  update(value) {
    const o = this.path.length;
    if (value !== null && value !== undefined) {
      for (let view of this.views) {
        for (let state of view.states) {
          if (state) {
            state.update(pathData(state.path, value, o));
          }
        }
      }
    }
  }

  unmount() {
    for (let view of this.views) {
      view.root?.parentElement?.removeChild(view.root);
    }
  }

  dispose() {
    for (let view of this.views) {
      for (let state of view.states) {
        state?.dispose();
      }
    }
    TemplateEffector.All.delete(this.id, this);
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

  apply(node, value, global, local, path = undefined) {
    const views = [];
    const id = numcode(TemplateEffector.Counter++);
    // Creates nodes and corresponding effector states for each template
    // views.
    for (let view of this.template.views) {
      const root = view.root.cloneNode(true);
      // We update the `data-template` and `data-path` attributes, which is
      // used by `EventEffectors` in particular to find the scope.
      if (root.nodeType === Node.ELEMENT_NODE) {
        root.dataset["template"] = this.rootName || this.name;
        root.dataset["path"] = path ? path.join(".") : "";
        root.dataset["id"] = id;
      }
      // This mounts the view on the parent
      node.parentElement.insertBefore(root, node);
      const nodes = view.effectors.map((_) => {
        const n = pathNode(_.nodePath, root);
        return n;
      });
      // Now we create instances of the children effectors.
      const states = [];
      for (let i in view.effectors) {
        const e = view.effectors[i];
        states.push(
          e.apply(
            nodes[i], // the node was extracted from the view just before
            value, // we pass the `value` as-is
            global,
            local,
            path // and the `path` as well
          )
        );
      }
      // We add the view, which will be collected in the template effector.
      views.push({
        root,
        nodes,
        states,
      });
    }
    return new TemplateEffect(this, node, value, path, views, id);
  }
}

// EOF
