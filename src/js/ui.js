import $ from "./select.js";

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
// Returns the path for the given node.
const pathNode = (path, root) =>
  path.reduce((r, v) => (r ? r.childNodes[v] : r), root);

const pathData = (path, data) => {
  console.log("pathDdata", { path, data });
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
    this.formatter = formatter ? formatter : text;
  }

  apply(node, value) {
    node.setAttribute(this.name, this.formatter(value));
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
  constructor(nodePath, dataPath, name, formatter = undefined) {
    super(nodePath, dataPath);
    this.name = name;
    this.formatter = formatter ? formatter : text;
  }

  apply(node, value) {
    console.log("SLOT EFFECTOR", node, value);
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
const parseFormat = (text) => {
  const [path, format] = text.split("|");
  return [
    path.trim() === "." ? [""] : path.trim().split("."),
    Formats[format] || idem,
  ];
};

// --
// ## View
const view = (root, name = undefined) => {
  const effectors = [];
  // We take care of attribute effectors
  $(".out", root).forEach((_) => {
    const path = nodePath(_, root);
    for (let attr of _.attributes) {
      if (attr.name.startsWith("out-")) {
        const [dataPath, format] = parseFormat(attr.value);
        effectors.push(
          new AttributeEffector(path, dataPath, attr.name.substring(4), format)
        );
        _.removeAttribute(attr.name);
      }
    }
  });
  // We take care of state change effectors
  $("*[when]", root).forEach((_) => {
    const [dataPath, extractor] = parseFormat(_.getAttribute("when"));
    effectors.push(new WhenEffector(nodePath(_, root), dataPath, extractor));
    _.removeAttribute("when");
  });
  // We take care of slots
  $("slot", root).forEach((_) => {
    const [dataPath, tmpl] = parseFormat(_.getAttribute("out-contents"));
    effectors.push(new SlotEffector(nodePath(_, root), dataPath, tmpl));
    _.parentElement.replaceChild(document.createComment(_.outerHTML), _);
  });
  return { root, effectors };
};

export const template = (node) => {
  let style = undefined;
  let script = undefined;
  let views = [];
  const name = node.getAttribute("id");

  $(node.content).forEach((_) => {
    switch (_.nodeName) {
      case "STYLE":
      case "SCRIPT":
        break;
      default:
        views.push(view(_.cloneNode(true), name));
    }
  });
  return { views, name, root: node };

  //  console.log("TEMPLATE:", node, $(node.content, "> *[]"));
  //  $(".out", node.content).forEach((_) => {
  //    for (const attr of _.attributes) {
  //      if (attr.name.startWith("out-")) {
  //      }
  //    }
  //  });
};

const onError = (message, context) => {
  console.error(message, context);
};

export const render = (root, template, data) => {
  const anchor = document.createComment(root.outerHTML);
  root.parentElement.replaceChild(anchor, root);

  console.log("TEMPLATE", template);
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

export const ui = (state) => {
  const templates = new Map();
  $("template").forEach((_) => {
    const t = template(_);
    templates.set(_.getAttribute("id") || templates.length, t);
  });

  // We render the components
  $(".ui").forEach((node) => {
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
  });
};

export default ui;
// EOF - vim: et ts=2 sw=2
