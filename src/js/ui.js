/*
     ___  ___  ___            ___  ________      
    |\  \|\  \|\  \          |\  \|\   ____\     
    \ \  \\\  \ \  \         \ \  \ \  \___|_    
     \ \  \\\  \ \  \      __ \ \  \ \_____  \   
      \ \  \\\  \ \  \ ___|\  \\_\  \|____|\  \  
       \ \_______\ \__\\__\ \________\____\_\  \ 
        \|_______|\|__\|__|\|________|\_________\
                                     \|_________|

*/

// --
// # UI.js
//
// *UI.js* is a toolkit/library/framework to create user interface for the
// web using plain JavaScript and HTML. It is designed for the Web and for
// Browsers, requiring no dedicated tooling or compiler, and to be easily
// embedded and used in different contexts.

// --
// ## Symbols

const Empty = new Object();

// --
// ## Paths

// -- doc
// Returns the path of the given `node` up until the given `root`, as an
// array of indices from `children`.
const nodePath = (node, root = undefined) => {
  const path = [];
  while (node && node != root && node.parentElement) {
    const children = node.parentElement.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i] === node) {
        path.push(i);
        break;
      }
    }
    node = node.parentElement;
  }
  return path.reverse(), path;
};

// -- doc
// Returns the node at the given `path` for the given `root` node.
const pathNode = (path, root) =>
  path.reduce((r, v) => (r ? r.childNodes[v] : r), root);

// -- doc
// Returns the value at the given `path` for the given `data`.
const pathData = (path, data) => {
  for (let key of path) {
    switch (key) {
      case "":
        break;
      default:
        data = data[key];
    }
    if (data === undefined) {
      return undefined;
    }
  }
  return data;
};

const composePaths = (...chunks) =>
  chunks.reduce(
    (r, v) => (v ? (v[0] === "" ? [...r, ...v.slice(1)] : v) : r),
    []
  );

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
    this.updater = this.update.bind(this);
    // TODO: Sub/Unsub should be passed through a context
    sub(this.path, this.updater);
  }

  update(event, topic, isDirect) {
    console.log("GOT UPDATE EVENT", event, { topic, isDirect });
    return this.effector.update(this, event.scope);
  }

  dispose() {
    unsub(this.path, this.updater);
  }
}

class Effector {
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
  }

  apply(node, value, path = undefined) {
    onError("Effector.apply: no implementation defined", { node, value });
  }

  update(state, value) {}

  unapply(state) {
    state.dispose();
  }
}

class AttributeEffector extends Effector {
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter;
  }

  apply(node, value, path = undefined) {
    node.setAttribute(this.name, this.formatter ? this.formatter(value) : text);
  }
}

class ValueEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    node[this.name] = this.formatter ? this.formatter(value) : value;
  }
}

class StyleEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    Object.assign(node.style, this.formatter ? this.formatter(value) : value);
  }
}

class WhenEffector extends Effector {
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

class EventEffector extends Effector {
  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let { template, path } = node.dataset;
      if (template && path) {
        return [template, parsePath(path)];
      }
      node = node.parentElement;
    }
    return null;
  }

  constructor(nodePath, dataPath, event, triggers) {
    super(nodePath, dataPath);
    this.event = event;
    this.triggers = triggers;
  }

  apply(node, value, path = undefined) {
    const name = this.triggers;
    const dataPath = composePaths(path, this.dataPath);
    // TODO: For TodoItem, the path should be .items.0, etc
    const handler = (event) => {
      const [template, scope] = EventEffector.FindScope(event.target);
      pub([template, name], { name, scope, data: event });
    };
    node.addEventListener(this.event, handler);
    // TODO: Return state
  }

  unapply(state) {
    //node.removeEventListener(this.event, state);
  }
}

class SlotEffectorState extends EffectorState {
  constructor(effector, node, value, path, items) {
    super(effector, node, value, path);
    this.items = items;
  }
}

// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
class SlotEffector extends Effector {
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
    const items = new Map();
    if (value instanceof Array) {
      for (let k = 0; k < value.length; k++) {
        const root = document.createComment(`slot:${k}`);
        node.parentElement.insertBefore(root, node);
        items.set(
          k,
          this.template.apply(
            root, // node
            value[k], // value
            path ? [...path, k] : [k] // path
          )
        );
      }
    } else {
      for (let k in value) {
        const root = document.createComment(`slot:${k}`);
        node.parentElement.insertBefore(root, node);
        items.set(
          k,
          this.template.apply(
            root, // node
            value[k], // value
            path ? [...path, k] : [k] // path // path // path // path
          )
        );
      }
    }
    return new SlotEffectorState(this, node, value, path, items);
  }

  // addItem(value, path, key) {
  //   return render(
  //     root,
  //     this.template,
  //     value[k],
  //     path ? [...path, k] : [k],
  //     items.get(k)
  //   );
  // }

  // removeItem(state, value, key) {
  //   // TODO: Should totally be an unapply
  //   /// render(state.root, this.template, value,
  //   //console.log("REMOVE ITEM"
  // }
}

class TemplateEffectorState extends EffectorState {
  constructor(effector, node, value, path, views, viewState) {
    super(effector, node, value, path);
    this.views = views;
    this.viewState = views.map((_) => undefined);
  }

  update() {}
}

class TemplateEffector {
  constructor(template) {
    this.template = template;
  }

  apply(node, value, path = undefined) {
    const views = [];
    // Creates nodes and corresponding effector states for each template
    // views.
    for (let view of this.template.views) {
      const root = view.root.cloneNode(true);
      // We update the `data-path` attribute, which is important to get the
      // data scope of a node.
      path && (root.dataset["path"] = path ? path.join(".") : ".");
      node.parentElement.insertBefore(root, node);
      const nodes = view.effectors.map((_) => pathNode(_.nodePath, root));
      // FIXME: Not sure if this is needed
      // this.template.name && (this.root.dataset["template"] = this.template.name);
      const states = [];
      for (let j in view.effectors) {
        const e = view.effectors[j];
        const effectorPath = composePaths(path || [], e.dataPath);
        states.push(
          e.apply(
            root, // node
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

// --
// ## Pub/Sub

class Topic {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = new Map();
    this.handlers = undefined;
    this.value = Empty;
    this.path = parent ? [...parent.path, name] : [name];
  }

  get(name) {
    return name instanceof Array
      ? name.reduce((r, v) => r.get(v), this)
      : this.children.has(name)
      ? this.children.get(name)
      : this.children.set(name, new Topic(name, this)).get(name);
  }

  pub(data) {
    this.value = data;
    let topic = this;
    while (topic) {
      if (topic.handlers) {
        for (let handler of topic.handlers) {
          // TODO: We should stop propagation
          handler(data, topic, topic === this);
        }
      }
      topic = topic.parent;
    }
  }

  sub(handler, withLast = true) {
    if (!this.handlers) {
      this.handlers = [];
    }
    this.handlers.push(handler);
    withLast && this.value !== Empty && handler(this.value);
    return this;
  }

  unsub(handler) {
    let i = 0;
    while (i >= 0) {
      i = this.handlers.indexOf(handler);
      if (i >= 0) {
        this.handlers.splice(i, 1);
      }
    }
    return this;
  }
}

class PubSub {
  constructor() {
    this.topics = new Topic();
  }

  get(topic) {
    return topic
      ? topic instanceof Topic
        ? topic
        : this.topics.get(topic instanceof Array ? topic : topic.split("."))
      : this.topics;
  }

  pub(topic, data) {
    return this.get(topic).pub(data), this;
  }

  sub(topic, handler) {
    return this.get(topic).sub(handler), this;
  }

  unsub(topic, handler) {
    return this.get(topic).unsub(handler), this;
  }
}

const bus = new PubSub();
export const pub = (topic, data) => bus.pub(topic, data);
export const sub = (topic, handler) => bus.sub(topic, handler);
export const unsub = (topic, handler) => bus.unsub(topic, handler);

// --
// ## State Tree

class StateEvent {
  constructor(event, value, previous, scope, key) {
    this.event = event;
    this.value = value;
    this.previous = previous;
    this.scope = scope;
    this.key = key;
  }
}

class StateTree {
  constructor() {
    this.state = {};
  }

  // -- doc
  // Retrieves the value at the given `path`
  get(path) {
    let res = this.state;
    for (let k of path instanceof Array ? path : path.split(".")) {
      if (!res) {
        return undefined;
      }
      res = res[k];
    }
    return res;
  }

  // -- doc
  // Ensures there's a value at the given `path`, assigning the `defaultValue`
  // if not existing.
  ensure(path, defaultValue = undefined, offset = 0) {
    let scope = this.state;
    const p = path instanceof Array ? path : path.split(".");
    let i = 0;
    const j = p.length - 1 + offset;
    while (i <= j) {
      const k = p[i++];
      if (scope[k] === undefined) {
        if (i === j && defaultValue !== undefined) {
          scope = scope[k] = defaultValue;
        } else if (typeof k === "number") {
          scope = scope[k] = [];
        } else {
          scope = scope[k] = {};
        }
      } else {
        scope = scope[k];
      }
    }
    return scope;
  }

  // -- doc
  // Returns the scope (ie. the parent object) at the give path. For instance
  // if the path is `items.1`, this will return the value at path `items`.
  scope(path) {
    return this.ensure(path, undefined, -1);
  }

  // -- doc
  // Patches the `value` at the given `path`.
  patch(path = null, value = undefined) {
    const p = path instanceof Array ? path : path ? path.split(".") : [];
    console.log("PATCH", path, value);
    if (p.length === 0) {
      this.state = value;
    } else {
      const scope = this.scope(p);
      const key = p[p.length - 1];
      const previous = scope[key];
      console.log("SCOPE", p, "=", scope);
      if (scope[key] !== value) {
        // scope[key] may be undefined
        if (value === null) {
          if (scope instanceof Array) {
            scope.splice(key, 1);
          } else {
            delete scope[key];
          }
          // QUESTION: Shouldn't we remove at the full path, and then
          // send an update to the parent?
          pub(
            p.slice(0, -1),
            new StateEvent("Remove", null, previous, scope, key)
          );
        } else {
          if (scope instanceof Array) {
            while (scope.length < key) {
              scope.push(undefined);
            }
            scope[key] = value;
          } else {
            scope[key] = value;
          }
          pub(
            p.slice(0, -1),
            new StateEvent("Update", value, previous, scope, key)
          );
        }
      }
    }
  }
}

const state = new StateTree();
window.State = state;

export const patch = (path, data) => {
  state.patch(path, data);
};

// --
// ## Formats
const bool = (_) => (_ ? true : false);
const text = (_) => `${_}`;
const not = (_) => !bool(_);
const idem = (_) => _;

export const Formats = { bool, text, not, idem };

const RE_DIRECTIVE = new RegExp(
  /^(?<path>(\.?[A-Za-z0-9]+)(\.[A-Za-z0-9]+)*)?(\|(?<format>[A-Za-z-]+))?(!(?<event>[A-Za-z]+))?$/
);
const RE_NUMBER = /^\d+$/;

const parsePath = (path) => {
  if (path instanceof Array) {
    return path;
  } else {
    const p = path ? (path.trim() === "." ? [] : path.split(".")) : [];
    for (let i in p) {
      const k = p[i];
      if (k.match(RE_NUMBER)) {
        p[i] = parseInt(k);
      }
    }
    return p;
  }
};

// -- doc
// Parses the directive defined by `text`, where the string
// is like `data.path|formatter!event`.
const parseDirective = (text, defaultFormat = idem) => {
  const { path, format, event } = text.match(RE_DIRECTIVE)?.groups || {};

  return [
    parsePath(path),
    defaultFormat ? Formats[format] || defaultFormat : format,
    event,
  ];
};

// --
// ## View

const queryAttributes = function* (node, prefix) {
  const attrPrefix = `${prefix}-`;
  for (const _ of node.querySelectorAll(`.${prefix}`)) {
    for (let attr of _.attributes) {
      if (attr.name.startsWith(attrPrefix)) {
        yield [attr.name.substring(attrPrefix.length), attr.value, attr];
        _.removeAttribute(attr.name);
      }
    }
  }
};

const view = (root) => {
  const effectors = [];
  // We take care of attribute effectors
  for (const _ of root.querySelectorAll(".out")) {
    const path = nodePath(_, root);
    for (let attr of _.attributes) {
      if (attr.name.startsWith("out-")) {
        const name = attr.name.substring(4);
        const parentName = _.nodeName;
        const [dataPath, format] = parseDirective(attr.value, false);
        effectors.push(
          new (name === "style"
            ? StyleEffector
            : ((name === "value" || name === "disabled") &&
                (parentName === "INPUT" || parentName === "SELECT")) ||
              (name === "checked" && parentName === "INPUT")
            ? ValueEffector
            : AttributeEffector)(
            path,
            dataPath,
            name,
            typeof format === "string" ? Formats[format] : format
          )
        );
        // We remove the attribute
        _.removeAttribute(attr.name);
      }
    }
    _.classList.remove("out");
    _.classList.length == 0 && _.removeAttribute("class");
  }

  for (const _ of queryAttributes(root, "in")) {
    console.log("ATTR:IN", _);
  }

  for (const [event, value] of queryAttributes(root, "on")) {
    const [dataPath, _, effectEvent] = parseDirective(value);
    effectors.push(
      new EventEffector(nodePath(_, root), dataPath || [""], event, effectEvent)
    );
  }

  // We take care of state change effectors
  for (const _ of root.querySelectorAll("*[when]")) {
    const [dataPath, extractor] = parseDirective(_.getAttribute("when"));
    effectors.push(new WhenEffector(nodePath(_, root), dataPath, extractor));
    _.removeAttribute("when");
  }
  // We take care of slots
  for (const _ of root.querySelectorAll("slot")) {
    const [dataPath, templateName] = parseDirective(
      _.getAttribute("out-contents"),
      false
    );
    effectors.push(new SlotEffector(nodePath(_, root), dataPath, templateName));
    _.parentElement.replaceChild(document.createComment(_.outerHTML), _);
    _.removeAttribute("out-contents");
  }
  return { root, effectors };
};

// -- doc
// Keeps track of all the defined templates, which can then
// be reused.
const Templates = new Map();
class Template {
  constructor(root, views, name = undefined) {
    this.name = name;
    this.root = root;
    this.views = views;
  }
}

// -- doc
// Parses the given `node` and its descendants as a tempalte definition.
export const template = (node, name = node.getAttribute("id")) => {
  let views = [];
  // NOTE: We skip text nodes there
  for (let _ of node.content.children) {
    switch (_.nodeName) {
      case "STYLE":
        break;
      case "SCRIPT":
        document.body.appendChild(_);
        break;
      default:
        views.push(view(_.cloneNode(true), name));
    }
  }
  return new Template(node, views, name);
};

// TODO: This should probably be a rendereffector
//
// NOTE: We're storing the topic path of any component in the rendered
// component itself. This makes it possible to link a node to the context.
// export const render = (
//   root,
//   template,
//   data,
//   path = null,
//   state = undefined
// ) => {};

const parseState = (text) => eval(`(${text})`);

export const ui = (scope = document) => {
  const templates = Templates;

  for (let _ of document.querySelectorAll("template")) {
    const t = new TemplateEffector(template(_));
    templates.set(_.getAttribute("id") || templates.length, t);
  }

  // We render the components
  for (const node of scope.querySelectorAll(".ui")) {
    const { ui, state } = node.dataset;
    const template = templates.get(ui);
    const data = parseState(state);
    if (!template) {
      onError("ui.render: Could not find template '{ui}'", {
        node,
        ui,
      });
    } else {
      // We instanciate the template onto the node
      patch(null, data);
      const anchor = document.createComment(node.outerHTML);
      node.parentElement.replaceChild(anchor, node);
      const state = template.apply(anchor, data);
    }
  }
};

// --
//  ## Utilities

const onError = (message, context) => {
  console.error(message, context);
};

export default ui;

// EOF - vim: et ts=2 sw=2
