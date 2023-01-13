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
class Effector {
  static Type = "Effector";
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
  }

  get type() {
    return Object.getPrototypeOf(this).Type;
  }

  apply(node, value, state = undefined, path = undefined) {
    onError("Effector.apply: no implementation defined", { node, value });
  }
}

class AttributeEffector extends Effector {
  static Type = "AttributeEffector";
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter;
  }

  apply(node, value, state = undefined, path = undefined) {
    node.setAttribute(this.name, this.formatter ? this.formatter(value) : text);
  }
}

class ValueEffector extends AttributeEffector {
  static Type = "ValueEffector";
  apply(node, value, state = undefined, path = undefined) {
    node[this.name] = this.formatter ? this.formatter(value) : value;
  }
}

class StyleEffector extends AttributeEffector {
  static Type = "StyleEffector";
  apply(node, value, state = undefined, path = undefined) {
    Object.assign(node.style, this.formatter ? this.formatter(value) : value);
  }
}

class WhenEffector extends Effector {
  static Type = "WhenEffector";
  constructor(nodePath, dataPath, name, extractor = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.extractor = extractor ? extractor : bool;
  }

  apply(node, value, state = undefined, path = undefined) {
    if (this.extractor(value)) {
      node.style.display = "none";
    } else {
      node.style.display = null;
    }
  }
}

class EventEffector extends Effector {
  static Type = "EventEffector";
  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let { template, path } = node.dataset;
      if (template && path) {
        return [template, path];
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

  apply(node, value, state = undefined, path = undefined) {
    if (state === undefined) {
      const name = this.triggers;
      const dataPath = composePaths(path, this.dataPath);
      // TODO: For TodoItem, the path should be .items.0, etc
      const handler = (event) => {
        const [template, scope] = EventEffector.FindScope(event.target);
        pub([template, name], { name, scope, data: event });
      };
      node.addEventListener(this.event, handler);
      return handler;
    } else if (value === Empty) {
      node.removeEventListener(this.event, state);
    }
  }
}

class SlotEffector extends Effector {
  static Type = "SlotEffector";
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

  apply(node, value, state = undefined, path = undefined) {
    for (let k in value) {
      const root = document.createComment(`slot:${k}`);
      node.parentElement.insertBefore(root, node);
      render(root, this.template, value[k], path ? [...path, k] : [k]);
    }
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
export const patch = (data, path) => {
  console.log("Patching", data, "at", path);
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
// -- doc
// Parses the directive defined by `text`, where the string
// is like `data.path|formatter!event`.
const parseDirective = (text, defaultFormat = idem) => {
  const { path, format, event } = text.match(RE_DIRECTIVE)?.groups || {};
  return [
    path ? (path.trim() === "." ? [] : path.trim().split(".")) : undefined,
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

// NOTE: We're storing the topic path of any component in the rendered
// component itself. This makes it possible to link a node to the context.
export const render = (root, template, data, path = null) => {
  const anchor = document.createComment(root.outerHTML);
  root.parentElement.replaceChild(anchor, root);
  const views = [];
  console.log("RENDER", template.name, "at", path);
  for (let view of template.views) {
    const node = view.root.cloneNode(true);
    anchor.parentElement.insertBefore(node, anchor);
    views.push({
      root: node,
      nodes: view.effectors.map((_) => pathNode(_.nodePath, node)),
    });
  }

  for (let i in views) {
    const view = views[i];
    path && (view.root.dataset["path"] = path ? path.join(".") : ".");
    template.name && (view.root.dataset["template"] = template.name);
    const nodes = view.nodes;
    const effectors = template.views[i].effectors;
    for (let j in effectors) {
      const e = effectors[j];
      // TODO: For some reason, the EventEffector is not applied with the
      // proper path, and therefore the state scope is not working.
      //
      // TODO: We should probably have a component state tree as well.
      e.apply(
        nodes[j], // node
        pathData(e.dataPath, data), // value
        undefined, // state
        composePaths(path || [], e.dataPath) // path
      );
    }
  }

  return { anchor, views, data };
};

const parseState = (text) => eval(`(${text})`);

export const ui = (scope = document) => {
  const templates = Templates;

  for (let _ of document.querySelectorAll("template")) {
    const t = template(_);
    templates.set(_.getAttribute("id") || templates.length, t);
  }

  // We render the components
  for (const node of scope.querySelectorAll(".ui")) {
    const { ui, state } = node.dataset;
    const template = templates.get(ui);
    if (!template) {
      onError("ui.render: Could not find template '{ui}'", {
        node,
        ui,
      });
    } else {
      // We instanciate the template onto the node
      render(node, template, parseState(state));
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
