import { composePaths, parsePath, pathNode, pathData } from "./paths.js";
import { sub, unsub, pub } from "./pubsub.js";
import { patch } from "./state.js";
import { RawObjectPrototype, onError, numcode } from "./utils.js";
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
    this.value = value;
    this.global = global;
    this.local = local;
    this.path = path;
    this.handler = this.onChange.bind(this);
    // TODO: Sub/Unsub should be passed through a context
    // sub(this.path, this.handler, false);
  }

  onChange(event, topic, offset) {
    return this.update(event.value);
  }

  update(value = this.value) {}

  unmount() {}

  dispose() {
    // unsub(this.path, this.handler);
  }
}

export class Effector {
  // -- doc
  // An effector targets the node at the given `nodePath` and selects data
  // using the given `selector`.
  constructor(nodePath, selector) {
    this.nodePath = nodePath;
    this.selector = selector;
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

  update(value = this.value) {
    if (this.value !== value || !this.textNode.parentElement) {
      this.textNode.data =
        value === null || value === undefined
          ? ""
          : typeof value === "string"
          ? value
          : `${value}`;
      if (!this.textNode.parentElement) {
        this.node.parentElement.insertBefore(this.textNode, this.node);
      }
    }
  }
  unmount() {
    this.textNode.parentElement?.removeChild(this.textNode);
  }
}

class TextEffector extends Effector {
  apply(node, value, global, local, path = undefined) {
    return new TextEffect(this, node, value, global, local, path).update();
  }
}

// --
// ## Attribute Effector

class AttributeEffect extends Effect {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    this.node.setAttribute(
      this.effector.name,
      formatter ? formatter(value) : value
    );
    this.value = value;
    return this;
  }
}

export class AttributeEffector extends Effector {
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter;
  }

  apply(node, value, path = undefined) {
    return new AttributeEffect(this, node, value, path).update();
  }
}

// --
// ## Value Effector
//

class ValueEffect extends Effect {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    this.node[this.effector.name] = formatter ? formatter(value) : value;
    this.value = value;
    return this;
  }
}

export class ValueEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    return new ValueEffect(this, node, value, path).update();
  }
}

// --
// ## Style Effector
//
class StyleEffect extends Effect {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    Object.assign(this.node.style, formatter ? formatter(value) : value);
    this.value = value;
    return this;
  }
}
export class StyleEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    return new StyleEffect(this, node, value, path).update(value);
  }
}

//  --
// ## When Effector
//
class WhenEffect extends Effect {
  constructor(effector, node, value, path) {
    super(effector, node, value, path);
    this.displayValue = node.style.display;
  }

  update(value = this.value) {
    const v = this.effector.predicate ? this.effector.predicate(value) : value;
    this.node.style.display = v ? this.displayValue : "none";
    this.value = value;
    return this;
  }
}
export class WhenEffector extends Effector {
  constructor(nodePath, dataPath, predicate = undefined) {
    super(nodePath, dataPath);
    this.predicate = predicate;
  }

  apply(node, value, path = undefined) {
    return new WhenEffect(this, node, value, path).update(value);
  }
}

//  --
// ## Event Effector
//
export class EventEffector extends Effector {
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

  // -- doc
  // Creates a new `EventEffector` that  is triggered by the given `event`,
  // generating an event `triggers` (when defined), or
  constructor(nodePath, dataPath, event, directive, stops = false) {
    super(nodePath, dataPath);
    this.event = event;
    this.directive = directive;
  }

  apply(node, value, path = undefined) {
    const directive = this.directive;
    const { source, format, event: name, stops } = directive;
    // TODO: For TodoItem, the path should be .items.0, etc
    const handler = (event) => {
      // If there is a path then we update this based on the value
      if (path && path.length) {
        patch(
          path,
          (Formats[format] || idem)(
            source ? pathData(source, event) : EventEffector.Value(event)
          )
        );
      }
      if (name?.length) {
        const { template, path, id } = EventEffector.FindScope(event.target);
        pub(composePaths([template], name), {
          name,
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
    node.addEventListener(this.event, handler);
    // TODO: Return state
  }
}

// --
// ## Slot Effector
//
class SlotEffect extends Effect {
  constructor(effector, node, value, global, local, path, items) {
    super(effector, node, value, global, local, path);
    this.items = items;
  }

  create(value = this.value) {
    const { node, global, local, path } = this;
    const extracted = this.effector.selector.apply(value, global, local, path);

    // NOTE: This may be moved directly in the SlotEffect constructor,
    // but we leave it here for now.
    const isEmpty = extracted === null || extracted === undefined;
    const isAtom =
      isEmpty ||
      typeof extracted !== "object" ||
      (Object.getPrototypeOf(extracted) !== RawObjectPrototype &&
        !(extracted instanceof Array));
    // FIXME: This should be moved to the slot effector. We also need
    // to retrieve the key.
    const items = new Map();
    if (isEmpty) {
      // Nothing to do
    } else if (isAtom) {
      items.set(
        null,
        this.createItem(
          node, // node
          extracted, // value
          global,
          local,
          path ? path : [], // path
          true // isEmpty
        )
      );
    } else if (extracted instanceof Array) {
      for (let k = 0; k < extracted.length; k++) {
        items.set(
          k,
          this.createItem(
            node, // node
            extracted[k], // value
            global,
            local,
            path ? [...path, k] : [k] // path
          )
        );
      }
    } else {
      for (let k in extracted) {
        items.set(
          k,
          this.createItem(
            node, // node
            extracted[k], // value
            global,
            local,
            path ? [...path, k] : [k] // path
          )
        );
      }
    }
    return this;
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

  onChange(event, topic, offset) {
    if (offset === 1) {
      const action = event.event;
      if (action == "Update") {
        // NOTE: We don't have to do anything, the effector should already
        // be subscribed.
      } else if (action === "Delete") {
        const effector = this.items.get(event.key);
        // NOTE: The effector may be subscribed to already?
        if (effector) {
          effector.unmount();
          effector.dispose();
          this.items.delete(event.key);
          return true;
        } else {
          return false;
        }
      } else if (action == "Create") {
        if (!this.items.has(event.key)) {
          // FIXME: That does not take into account the order
          this.items.set(
            event.key,
            this.createItem(this.node, event.value, [...this.path, event.key])
          );
          return true;
        } else {
          return false;
        }
      }
    }
  }
}

// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
export class SlotEffector extends Effector {
  constructor(nodePath, selector, templateName) {
    super(nodePath, selector);
    this.templateName = templateName;
    this._template = templateName
      ? undefined
      : new TextEffector(nodePath, selector);
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
    return new SlotEffect(this, node, value, global, local, path).create();
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

export class TemplateEffector {
  // -- doc
  // Counts the number of template effectors created, this is the used
  // to assign the `data-scope` attribute.
  static Counter = 0;

  constructor(template, rootName = undefined) {
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
