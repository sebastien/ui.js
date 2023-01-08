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

// --
// ## Effectors
//
class Effector {
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
  }

  apply(node, value) {
    onError("Effector.apply: no implementation defined", { node, value });
  }
}

class AttributeEffector extends Effector {
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter;
  }

  apply(node, value) {
    node.setAttribute(this.name, this.formatter ? this.formatter(value) : text);
  }
}

class ValueEffector extends AttributeEffector {
  apply(node, value) {
    node[this.name] = this.formatter ? this.formatter(value) : value;
  }
}

class StyleEffector extends AttributeEffector {
  apply(node, value) {
    Object.assign(node.style, this.formatter ? this.formatter(value) : value);
  }
}

class WhenEffector extends Effector {
  constructor(nodePath, dataPath, name, extractor = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.extractor = extractor ? extractor : bool;
  }

  apply(node, value) {
    if (this.extractor(value)) {
      node.style.display = "none";
    } else {
      node.style.display = null;
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

  apply(node, value) {
    for (let k in value) {
      const root = document.createComment(`slot:${k}`);
      node.parentElement.insertBefore(root, node);
      render(root, this.template, value[k]);
    }
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
    path.trim() === "." ? [""] : path.trim().split("."),
    defaultFormat ? Formats[format] || defaultFormat : format,
  ];
};

// --
// ## View
const view = (root) => {
  const effectors = [];
  // We take care of attribute effectors
  console.log("VIEW", { root });
  for (const _ of root.querySelectorAll(".out")) {
    console.log("OUT", _);
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

const Templates = new Map();

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
  return { views, name, root: node };
};

const onError = (message, context) => {
  console.error(message, context);
};

export const render = (root, template, data) => {
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
    const nodes = view.nodes;
    const effectors = template.views[i].effectors;
    for (let j in effectors) {
      const e = effectors[j];
      e.apply(nodes[j], pathData(e.dataPath, data));
    }
  }

  return { anchor, views, data };
};

const parseState = (text) => eval(text);

export const ui = (state, scope = document) => {
  const templates = Templates;

  for (let _ of document.querySelectorAll("template")) {
    const t = template(_);
    templates.set(_.getAttribute("id") || templates.length, t);
  }
  console.log("TEMPLATES", Templates);

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
      console.log("RENDER", render(node, template, parseState(state)));
    }
  }
};

export default ui;
// EOF - vim: et ts=2 sw=2
