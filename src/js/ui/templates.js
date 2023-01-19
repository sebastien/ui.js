import { parsePath, nodePath } from "./paths.js";
import {
  SlotEffector,
  EventEffector,
  WhenEffector,
  StyleEffector,
  ValueEffector,
  AttributeEffector,
} from "./effectors.js";
import { Formats, idem } from "./formats.js";

// --
// ## Views

class View {
  constructor(root, effectors) {
    this.root = root;
    this.effectors = effectors;
  }
}

// -- doc
// Creates a view from the given `root` node, looking for specific
// attribute types (`in:*=`, `out:*=`, `on:*=`, `when=`) and
// creating corresponding effectors.
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

  return new View(root, effectors);
};

// -- doc
// Keeps track of all the defined templates, which can then
// be reused.
//

export const Templates = new Map();

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

// --
// ## Directives

const RE_DIRECTIVE = new RegExp(
  /^(?<path>(\.?[A-Za-z0-9]+)(\.[A-Za-z0-9]+)*)?(\|(?<format>[A-Za-z-]+))?(!(?<event>[A-Za-z]+))?$/
);

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

// EOF
