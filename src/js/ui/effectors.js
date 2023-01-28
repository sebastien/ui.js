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

class EffectorState {
  constructor(effector, node, value, path) {
    this.effector = effector;
    this.node = node;
    this.value = value;
    this.path = path;
    this.handler = this.onChange.bind(this);
    // TODO: Sub/Unsub should be passed through a context
    sub(this.path, this.handler, false);
  }

  onChange(event, topic, offset) {
    const path = this.path;
    return this.update(event.value);
  }

  update(value = this.value) {}

  unmount() {}

  dispose() {
    unsub(this.path, this.handler);
  }
}

export class Effector {
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
  }

  apply(node, value, path = undefined) {
    onError("Effector.apply: no implementation defined", { node, value });
  }
}

// --
// ## Attribute Effector
//
class TextEffectorState extends EffectorState {
  constructor(effector, node, value, path) {
    super(effector, node, value, path);
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
  apply(node, value, path = undefined) {
    return new TextEffectorState(this, node, value, path).update();
  }
}

// --
// ## Attribute Effector

class AttributeEffectorState extends EffectorState {
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
    return new AttributeEffectorState(this, node, value, path).update();
  }
}

// --
// ## Value Effector
//

class ValueEffectorState extends EffectorState {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    this.node[this.effector.name] = formatter ? formatter(value) : value;
    this.value = value;
    return this;
  }
}

export class ValueEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    return new ValueEffectorState(this, node, value, path).update();
  }
}

// --
// ## Style Effector
//
class StyleEffectorState extends EffectorState {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    Object.assign(this.node.style, formatter ? formatter(value) : value);
    this.value = value;
    return this;
  }
}
export class StyleEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    return new StyleEffectorState(this, node, value, path).update(value);
  }
}

//  --
// ## When Effector
//
class WhenEffectorState extends EffectorState {
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
    return new WhenEffectorState(this, node, value, path).update(value);
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
          state: TemplateEffectorState.All.get(id)?.state,
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

class SlotEffectorState extends EffectorState {
  constructor(effector, node, value, path, items) {
    super(effector, node, value, path);
    this.items = items;
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
            this.effector.createItem(this.node, event.value, [
              ...this.path,
              event.key,
            ])
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
  constructor(nodePath, dataPath, templateName) {
    super(nodePath, dataPath);
    this.templateName = templateName;
    this._template = templateName
      ? undefined
      : new TextEffector(nodePath, dataPath);
  }

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

  apply(node, value, path = undefined) {
    // NOTE: This may be moved directly in the SlotEffectorState constructor,
    // but we leave it here for now.
    const isEmpty = value === null || value === undefined;
    const isAtom =
      isEmpty ||
      typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== RawObjectPrototype &&
        !(value instanceof Array));
    console.log("APPLY EFFECTOR", { value, path, node, isAtom });

    if (path[0] === "@key") {
      debugger;
    }
    const items = new Map();
    if (isEmpty) {
      // Nothing to do
    } else if (isAtom) {
      items.set(
        null,
        this.createItem(
          node, // node
          value, // value
          path ? path : [], // path
          true // isEmpty
        )
      );
    } else if (value instanceof Array) {
      for (let k = 0; k < value.length; k++) {
        items.set(
          k,
          this.createItem(
            node, // node
            value[k], // value
            path ? [...path, k] : [k] // path
          )
        );
      }
    } else {
      for (let k in value) {
        items.set(
          k,
          this.createItem(
            node, // node
            value[k], // value
            path ? [...path, k] : [k] // path // path // path // path
          )
        );
      }
    }
    return new SlotEffectorState(this, node, value, path, items);
  }

  createItem(node, value, path, isEmpty = false) {
    const root = document.createComment(
      `slot:${isEmpty ? "null" : path.at(-1)}`
    );
    // We need to insert the node before as the template needs a parent
    node.parentElement.insertBefore(root, node);
    return this.template.apply(
      root, // node
      value,
      path
    );
  }
}

class TemplateEffectorState extends EffectorState {
  static All = new Map();
  constructor(effector, node, value, path, views, id) {
    super(effector, node, value, path);
    this.views = views;
    this.id = id;
    this.data = {};
    this.state = new Proxy(this.data, {
      set: (target, prop, value) => {
        target[prop] = value;
        return value;
      },
      get: (target, prop, receiver) =>
        prop === "update"
          ? this.updateState.bind(this)
          : prop in target
          ? target[prop]
          : undefined,
    });
    TemplateEffectorState.All.set(id, this);
  }

  updateState(items) {
    for (let k in items) {
      this.data[k] = items[k];
    }
    return items;
  }

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

  apply(node, value, path = undefined) {
    const views = [];
    const id = numcode(TemplateEffector.Counter++);
    // Creates nodes and corresponding effector states for each template
    // views.
    for (let view of this.template.views) {
      const root = view.root.cloneNode(true);
      // We update the `data-template` and `data-path` attributes, which is
      // used by `EventEffectors` in particular to find the scope.
      root.dataset["template"] = this.rootName || this.name;
      root.dataset["path"] = path ? path.join(".") : "";
      root.dataset["id"] = id;
      node.parentElement.insertBefore(root, node);
      const nodes = view.effectors.map((_) => {
        const n = pathNode(_.nodePath, root);
        return n;
      });
      const states = [];
      for (let i in view.effectors) {
        const e = view.effectors[i];
        const effectorPath = composePaths(path || [], e.dataPath);
        states.push(
          e.apply(
            nodes[i], // node
            pathData(e.dataPath, value), // value
            effectorPath // path
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
    return new TemplateEffectorState(this, node, value, path, views, id);
  }
}

// EOF
