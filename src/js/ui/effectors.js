import { composePaths, parsePath, pathNode, pathData } from "./paths.js";
import { sub, unsub, pub } from "./pubsub.js";
import { patch } from "./state.js";
import { onError } from "./utils.js";
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
export class WhenEffector extends Effector {
  constructor(nodePath, dataPath, name, extractor = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.extractor = extractor ? extractor : bool;
  }

  apply(node, value, path = undefined) {
    if (this.extractor(value)) {
      node.style.display = "none";
    } else {
      node.style.display = null;
    }
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
      let { template, path } = node.dataset;
      if (template && path !== undefined) {
        return [template, parsePath(path)];
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
    const { source, format, event, stops } = directive;
    // TODO: For TodoItem, the path should be .items.0, etc
    const handler = (data) => {
      // If there is a path then we update this based on the value
      if (path && path.length) {
        patch(
          path,
          (Formats[format] || idem)(
            source ? pathData(source, data) : EventEffector.Value(data)
          )
        );
      }
      if (event) {
        const [template, scope] = EventEffector.FindScope(data.target);
        pub([template, event], { event, scope, data });
      }
      if (stops) {
        event.stopPropagation();
        event.cancelDefault();
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
        // NOTE: We don't ahve to do anything, the efefctor should already
        // be subscribed.
      } else if (action === "Delete") {
        const effector = this.items.get(event.key);
        // NOTE: The effector may be subsribed to already?
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
    this.templateName = templateName
      ? templateName
      : onError("SlotEffector: templateName is undefined", { templateName });
    this._template = undefined;
  }

  get template() {
    return this._template
      ? this._template
      : (this._template = Templates.get(this.templateName));
  }

  apply(node, value, path = undefined) {
    // NOTE: This may be moved directly in the SlotEffectorState constructor,
    // but we leave it here for now.
    const items = new Map();
    if (value instanceof Array) {
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
            nod, // node
            value[k], // value
            path ? [...path, k] : [k] // path // path // path // path
          )
        );
      }
    }
    return new SlotEffectorState(this, node, value, path, items);
  }

  createItem(node, value, path) {
    const root = document.createComment(`slot:${path.at(-1)}`);
    // We need to insert the node before as the template needs a parent
    node.parentElement.insertBefore(root, node);
    const state = this.template.apply(
      root, // node
      value,
      path
    );
    return state;
  }
}

class TemplateEffectorState extends EffectorState {
  constructor(effector, node, value, path, views) {
    super(effector, node, value, path);
    this.views = views;
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
  }
}

export class TemplateEffector {
  constructor(template) {
    this.template = template;
  }

  apply(node, value, path = undefined) {
    const views = [];
    // Creates nodes and corresponding effector states for each template
    // views.
    for (let view of this.template.views) {
      const root = view.root.cloneNode(true);
      // We update the `data-template` and `data-path` attributes, which is
      // used by `EventEffectors` in particular to find the scope.
      root.dataset["template"] = this.template.name;
      root.dataset["path"] = path ? path.join(".") : "";
      node.parentElement.insertBefore(root, node);
      const nodes = view.effectors.map((_) => {
        const n = pathNode(_.nodePath, root);
        return n;
      });
      // FIXME: Not sure if this is needed
      // this.template.name && (this.root.dataset["template"] = this.template.name);
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
    return new TemplateEffectorState(this, node, value, path, views);
  }
}

// EOF
