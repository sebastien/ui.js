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

// --
// ## Effectors
//
class Effector {
  constructor(nodePath, dataPath) {
    this.nodePath = nodePath;
    this.dataPath = dataPath;
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
    super(nodePath, dataPath, template);
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
    super(nodePath, dataPath, template);
    this.name = name;
    this.formatter = formatter ? formatter : text;
    this.template = template;
  }

  apply(node, value) {
    node.setAttribute(this.name, this.formatter(value));
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
  return [path.split("."), Formats[format] || idem];
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
      }
    }
  });
  // We take care of state change effectors
  $("*[when]", root).forEach((_) => {
    const [dataPath, extractor] = parseFormat(_.getAttribute("when"));
    effectors.push(new WhenEffector(nodePath(_, root), dataPath, extractor));
  });
  // We take care of slots
  $("slot", root).forEach((_) => {
    const [dataPath, tmpl] = parseFormat(_.getAttribute("out-contents"));
    effectors.push(new SlotEffector(nodePath(_, root), dataPath, tmpl));
  });
  console.log("EFF", { effectors });
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
        views.push(view(_, name));
    }
  });

  //  console.log("TEMPLATE:", node, $(node.content, "> *[]"));
  //  $(".out", node.content).forEach((_) => {
  //    for (const attr of _.attributes) {
  //      if (attr.name.startWith("out-")) {
  //      }
  //    }
  //  });
};

export const render = () => {
  $("template").forEach((_) => {
    template(_);
  });
};

// -- doc
// Utility function to reload the page automatically when the given URL changes.
export const reload = (url, period = 2000.0) => {
  const state = { lastModified: undefined, stop: false, interval: undefined };
  const update = () => {
    if (state.stop) {
      window.clearInterval(state.interval);
    }
    fetch(url, { method: "HEAD" }).then((_) => {
      const lastModified = _.headers.get("last-modified");
      if (state.lastModified && state.lastModified !== lastModified) {
        state.lastModified = lastModified;
        console.log("ui.reload: Monitor has changed, reloading", { url });
        window.location.reload();
      } else {
        state.lastModified = lastModified;
      }
    });
  };
  state.interval = window.setInterval(update, period);
  return state;
};

export default render;
// EOF - vim: et ts=2 sw=2
