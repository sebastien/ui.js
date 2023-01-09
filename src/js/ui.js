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
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
  }

  apply(node, value, state = undefined, path = undefined) {
    onError("Effector.apply: no implementation defined", { node, value });
  }
}

class AttributeEffector extends Effector {
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
  apply(node, value, state = undefined, path = undefined) {
    node[this.name] = this.formatter ? this.formatter(value) : value;
  }
}

class StyleEffector extends AttributeEffector {
  apply(node, value, state = undefined, path = undefined) {
    Object.assign(node.style, this.formatter ? this.formatter(value) : value);
  }
}

class WhenEffector extends Effector {
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

  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let path = node.dataset.path;
      if (path) {
        return path;
      }
      node = node.parentElement;
    }
    return null;
  }

  constructor(nodePath, dataPath, event) {
    super(nodePath, dataPath);
    this.event = event;
  }

  apply(node, value, state = undefined, path = undefined) {
    if (state === undefined) {
      const scope = EventEffector.FindScope(event.target);
      const handler = (event) => {
        console.log("EVENT", {
          event,
          node,
          value,
          state,
          path,
          scope: ,
        });
      };
      node.addEventListener(this.event, handler);
      return handler;
    } else if (value === Empty) {
      node.removeEventListener(this.event, state);
    }
  }
}

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
    this.value = Empty;
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
    for (let handler of this.handlers) {
      handler(data);
    }
  }

  sub(handler, withLast = true) {
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

// --
// ## Formats
const bool = (_) => (_ ? true : false);
const text = (_) => `${_}`;
const not = (_) => !bool(_);
const idem = (_) => _;

export const Formats = { bool, text, not, idem };

// -- doc
// Parses the format string defined by `text`, where the format string
// is like `data|formatter` and data is `.`-separated path to select the
// data and `formatter` is one of the `Format` entries.
const parseFormat = (text, defaultFormat = idem) => {
  const [path, format] = text.split("|");
  return [
    path.trim() === "." ? [] : path.trim().split("."),
    defaultFormat ? Formats[format] || defaultFormat : format,
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
        const [dataPath, format] = parseFormat(attr.value, false);
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

  for (const [event, value, _] of queryAttributes(root, "on")) {
    console.log("EVENT", { event, value });
    effectors.push(new EventEffector(nodePath(_, root), [], event));
  }

  // We take care of state change effectors
  for (const _ of root.querySelectorAll("*[when]")) {
    const [dataPath, extractor] = parseFormat(_.getAttribute("when"));
    effectors.push(new WhenEffector(nodePath(_, root), dataPath, extractor));
    _.removeAttribute("when");
  }
  // We take care of slots
  for (const _ of root.querySelectorAll("slot")) {
    const [dataPath, templateName] = parseFormat(
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
      case "SCRIPT":
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
    const nodes = view.nodes;
    const effectors = template.views[i].effectors;
    for (let j in effectors) {
      const e = effectors[j];
      e.apply(
        nodes[j],
        pathData(e.dataPath, data),
        undefined,
        composePaths(path || [], e.dataPath)
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
