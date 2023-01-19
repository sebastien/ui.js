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
//
// *UI.js* uses granular rendering direcly based on data changes using
// a centralised state tree. Components can then subscribe and subsribe
// to data changes to be updated.

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
const pathData = (path, data, offset = 0) => {
  const n = path.length;
  while (offset < n) {
    const key = path[offset++];
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

window.composePaths = composePaths;
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
    sub(this.path, this.handler);
  }

  onChange(event, topic, offset) {
    const path = this.path;
    return this.update(event.value);
  }

  update(value) {}

  unmount() {}

  dispose() {
    unsub(this.path, this.handler);
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
}

class AttributeEffectorState extends EffectorState {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    this.node.setAttribute(
      this.effector.name,
      formatter ? formatter(value) : value
    );
    return this;
  }
}

class AttributeEffector extends Effector {
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter;
  }

  apply(node, value, path = undefined) {
    return new AttributeEffectorState(this, node, value, path).update();
  }
}

class ValueEffectorState extends EffectorState {
  update(value = this.value) {
    const formatter = this.effector.formatter;
    this.node[this.effector.name] = formatter ? formatter(value) : value;
    return this;
  }
}

class ValueEffector extends AttributeEffector {
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
    return this;
  }
}
class StyleEffector extends AttributeEffector {
  apply(node, value, path = undefined) {
    return new StyleEffectorState(this, node, value, path).update(value);
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
    return [null, null];
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
      root.dataset["template"] = this.template.name;
      // We update the `data-path` attribute, which is important to get the
      // data scope of a node.
      path && (root.dataset["path"] = path ? path.join(".") : ".");
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

// --
// ## Pub/Sub

class Topic {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = new Map();
    this.handlers = undefined;
    this.value = Empty;
    this.path =
      name !== "" && name !== null && name !== undefined
        ? parent
          ? [...parent.path, name]
          : [name]
        : [];
  }

  get(name) {
    return name instanceof Array
      ? name.reduce((r, v) => r.get(v), this)
      : this.children.has(name)
      ? this.children.get(name)
      : this.children.set(name, new Topic(name, this)).get(name);
  }

  move(ka, kb) {
    const a = this.children.get(ka);
    this.children.delete(ka);
    const b = this.children.get(kb);
    this.children.set(kb, a);
    return b;
  }

  pub(data) {
    this.value = data;
    let topic = this;
    let offset = 0;
    while (topic) {
      if (topic.handlers) {
        for (let handler of topic.handlers) {
          // TODO: We should stop propagation
          handler(data, topic, offset);
        }
      }
      topic = topic.parent;
      offset += 1;
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

  walk(callback) {
    if (callback(this) !== false) {
      for (let v of this.children.values()) {
        if (v.walk(callback) === false) {
          return false;
        }
      }
    }
  }

  list() {
    const res = [];
    this.walk((_) => res.push(_));
    return res;
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
    const p = path instanceof Array ? path : path ? parsePath(path) : [];
    if (p.length === 0) {
      this.state = value;
    } else {
      const scope = this.scope(p);
      const key = p[p.length - 1];
      const base = p.slice(0, -1);
      if (scope[key] !== value) {
        // scope[key] may be undefined
        if (value === null) {
          // If the value is removed
          if (scope instanceof Array) {
            // We test for an Array
            const n = scope.length;
            const last = scope[n - 1];
            scope.splice(key, 1);
            // NOTE: This is not great as this will send as many events as there are
            // next items, this is because all the indices have changed, and we need
            // to update the topic tree.
            for (let i = key; i < n - 1; i++) {
              pub(
                [...base, i],
                new StateEvent("Update", scope[i], scope[i + 1], i)
              );
            }
            pub(p, new StateEvent("Delete", null, last, scope, n - 1));
          } else {
            // Or a dictionary
            const previous = scope[key];
            delete scope[key];
            pub(p, new StateEvent("Delete", null, previous, scope, key));
          }
        } else {
          const previous = scope[key];
          // The value is not removed, easy case
          if (scope instanceof Array) {
            while (scope.length < key) {
              scope.push(undefined);
            }
            scope[key] = value;
          } else {
            scope[key] = value;
          }
          pub(
            p,
            new StateEvent(
              previous === undefined ? "Create" : "Update",
              value,
              previous,
              scope,
              key
            )
          );
        }
      }
    }
  }
}

const state = new StateTree();

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

// -- doc
// Iterates through the attributes that match the given RegExp. This is
// because we need to query namespace selectors.
const queryAttributesLike = function* (node, regexp) {
  let walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  const cleanup = [];
  while (walker.nextNode()) {
    let node = walker.currentNode;
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      // NOTE: Not sure that would work for XHTML
      const match = regexp.exec(attr.name);
      if (match) {
        yield [match, attr];
        cleanup.push(attr);
      }
    }
  }
};

const view = (root) => {
  const effectors = [];

  //--
  // We start by getting all the nodes within the `in`, `out` and `on`
  // namespaces.
  const attrs = {};
  for (const [match, attr] of queryAttributesLike(
    root,
    /^(?<type>in|out|on):(?<name>.+)$/
  )) {
    const type = match.groups.type;
    const name = match.groups.name;
    (attrs[type] = attrs[type] || []).push({ name, attr });
  }
  console.log("ATTRS", attrs);

  // We take care of attribute/content/value effectors
  for (const { name, attr } of attrs["out"] || {}) {
    const node = attr.ownerElement;
    const path = nodePath(attr, root);
    const parentName = node.nodeName;
    const [dataPath, format] = parseDirective(attr.value, false);
    if (parentName === "slot" && name === "content") {
      effectors.push(new SlotEffector(nodePath(node, root), dataPath, format));
      node.parentElement.replaceChild(
        // This is a placholder, the contents  is not important.
        document.createComment(node.outerHTML),
        node
      );
    } else {
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
    }
    // We remove the attribute from the template as it is now processed
    node.removeAttribute(attr.name);
  }

  // We take care of slots
  // for (const _ of root.querySelectorAll("slot")) {
  //   const [dataPath, templateName] = parseDirective(
  //     _.getAttribute("out:contents"),
  //     false
  //   );
  //   effectors.push(new SlotEffector(nodePath(_, root), dataPath, templateName));
  //   _.parentElement.replaceChild(document.createComment(_.outerHTML), _);
  //   _.removeAttribute("out:contents");
  // }

  for (const { name, attr } of attrs["in"] || {}) {
    const node = attr.ownerElement;
    console.log("TODO: ATTR:IN", { name });
    node.removeAttribute(attr.name);
  }

  for (const { name, attr } of attrs["on"] || {}) {
    const node = attr.ownerElement;
    const [dataPath, _, effectEvent] = parseDirective(attr.value);
    effectors.push(
      new EventEffector(nodePath(_, root), dataPath || [""], name, effectEvent)
    );
    node.removeAttribute(attr.name);
  }

  // We take care of state change effectors
  for (const _ of root.querySelectorAll("*[when]")) {
    const [dataPath, extractor] = parseDirective(_.getAttribute("when"));
    effectors.push(new WhenEffector(nodePath(_, root), dataPath, extractor));
    _.removeAttribute("when");
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
  for (const node of scope.querySelectorAll("*[data-ui]")) {
    const { ui, state } = node.dataset;
    const template = templates.get(ui);
    const data = parseState(state);
    if (!template) {
      onError(`ui.render: Could not find template '{ui}'`, {
        node,
        ui,
      });
    } else {
      // We instanciate the template onto the node
      patch(null, data);
      const anchor = document.createComment(node.outerHTML);
      node.parentElement.replaceChild(anchor, node);
      const state = template.apply(anchor, data, []);
    }
  }
};

// --
//  ## Utilities

const onError = (message, context) => {
  console.error(message, context);
};

// DEBUG
window.STATE = state;
window.BUS = bus;

export default ui;

// EOF - vim: et ts=2 sw=2
