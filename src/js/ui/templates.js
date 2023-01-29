import { parseSelector } from "./selector.js";
import { nodePath } from "./paths.js";
import {
  SlotEffector,
  EventEffector,
  WhenEffector,
  StyleEffector,
  ValueEffector,
  AttributeEffector,
  TemplateEffector,
} from "./effectors.js";
import { Formats } from "./formats.js";
import { onError, makeKey } from "./utils.js";
import { styled } from "./tokens.js";
import { stylesheet } from "./css.js";

const RE_NUMBER = /^\d+(\.\d+)?$/;
export const parseValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  switch (value.at(0)) {
    case '"':
    case "'":
    case "`":
    case "{":
    case "[":
    case "(":
      return eval(value);
    default:
      return RE_NUMBER.test(value) ? parseFloat(value) : value;
  }
};

// --
// ## Tree Walking
//
// Processing templates requires walking through the nodes in the tree
// and looking for special nodes.

// --
// We don't want to recurse through filters.
const TreeWalkerFilter = {
  acceptNode: (node) => {
    const tagName = node?.parentNode?.tagName;
    return tagName === "SLOT" || tagName === "slot"
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT;
  },
};

// -- doc
// Iterates through the attributes of the given `node` which
// name matches `regexp`.
const iterAttributesLike = function* (node, regexp) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      // NOTE: Not sure that would work for XHTML
      const match = regexp.exec(attr.name);
      if (match) {
        yield [match, attr];
      }
    }
  }
};

// -- doc
// Iterates through the attributes that match the given RegExp. This is
// because we need to query namespace selectors.
const iterAttributes = function* (node, regexp) {
  let walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT,
    TreeWalkerFilter
  );
  for (let r of iterAttributesLike(node, regexp)) {
    yield r;
  }
  while (walker.nextNode()) {
    let node = walker.currentNode;
    for (let r of iterAttributesLike(node, regexp)) {
      yield r;
    }
  }
};

// -- doc
// Iterates through the descendants of `node` (including itself), yielding
// nodes that match the given `selector`.
const iterSelector = function* (node, selector) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.matches(selector)) {
      yield node;
    }
    for (const _ of node.querySelectorAll(selector)) {
      yield _;
    }
  }
};

const isNodeEmpty = (node) => {
  const n = node.childNodes.length;
  for (let i = 0; i < n; i++) {
    const child = node.childNodes[i];
    switch (child.nodeType) {
      case Node.TEXT_NODE:
        if (!/^\s*$/.test(child.data)) {
          return false;
        }
        break;
      case Node.ELEMENT_NODE:
        return false;
    }
  }
  return true;
};

// --
// ## Views
//
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
const view = (root, templateName = undefined) => {
  const effectors = [];

  // TODO: Query the styled variants

  //--
  // We start by getting all the nodes within the `in`, `out` and `on`
  // namespaces.
  const attrs = {};
  for (const [match, attr] of iterAttributes(
    root,
    /^(?<type>in|out|on|when|styled):(?<name>.+)$/
  )) {
    const type = match.groups.type;
    const name = match.groups.name;
    (attrs[type] = attrs[type] || []).push({ name, attr });
  }

  // --
  // ### Styled attributes
  //
  // We expand the style attributes, which are then aggregated in the
  // `styleRules` dict.
  const styledRules = {};
  for (const node of iterSelector(root, "*[styled]")) {
    const { rules, classes } = styled(node.getAttribute("styled"));
    Object.assign(styledRules, rules);
    classes.forEach((_) => node.classList.add(_));
    node.removeAttribute("styled");
  }

  for (const { name, attr } of attrs["styled"] || []) {
    const { rules, classes } = styled(attr.value, `:${name}`);
    Object.assign(styledRules, rules);
    const node = attr.ownerElement;
    classes.forEach((_) => node.classList.add(_));
    node.removeAttribute("styled");
  }

  // If we have more than one `styledRule`, then we declare a stylesheet.
  if (Object.keys(styledRules).length > 0) {
    // NOTE: We should probably put that as part of the view and not
    // necessarily create it right away.
    stylesheet(styledRules);
  }

  // --
  // ### `out:*` attributes
  //
  // We take care of attribute/content/value effectors
  for (const { name, attr } of attrs["out"] || []) {
    const node = attr.ownerElement;
    const path = nodePath(node, root);
    const parentName = node.nodeName;
    const selector = parseSelector(attr.value || `.${name}`, false);
    if (
      // In SVG, these nodes are lowercase.
      (parentName === "SLOT" || parentName === "slot") &&
      name === "content"
    ) {
      const format = selector.format
        ? selector.format
        : isNodeEmpty(node)
        ? null // An empty node means a null (text) formatter
        : template(
            // The format is the template id
            node,
            `${templateName || makeKey()}-${effectors.length}`,
            templateName, // This is the parent name
            false // No need to clone there
          ).name;

      effectors.push(new SlotEffector(path, selector, format));
      node.parentElement.replaceChild(
        // This is a placeholder, the contents  is not important.
        document.createComment(node.outerHTML),
        node
      );
    } else {
      console.log("TODO: Style/Attribute/Value effectors");
      // effectors.push(
      //   new (name === "style"
      //     ? StyleEffector
      //     : ((name === "value" || name === "disabled") &&
      //         (parentName === "INPUT" || parentName === "SELECT")) ||
      //       (name === "checked" && parentName === "INPUT")
      //     ? ValueEffector
      //     : AttributeEffector)(
      //     path,
      //     directive.path,
      //     name,
      //     typeof format === "string" ? Formats[format] : format
      //   )
      // );
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

  // TODO: We should implement int
  // for (const { name, attr } of attrs["in"] || []) {
  //   const node = attr.ownerElement;
  //   console.log("TODO: ATTR:IN", { name });
  //   node.removeAttribute(attr.name);
  // }

  // --
  // ### Event effectors
  //
  for (const { name, attr } of attrs["on"] || []) {
    const node = attr.ownerElement;
    const selector = parseSelector(attr.value);
    console.log("TODO: Event Effector");
    // TODO: Support "on:change=.checked:not"
    // effectors.push(
    //   new EventEffector(
    //     nodePath(node, root),
    //     directive.path || [""],
    //     name,
    //     directive
    //   )
    // );
    node.removeAttribute(attr.name);
  }

  // --
  //
  // ### Conditional effectors
  for (const { name, attr } of attrs["when"] || []) {
    const node = attr.ownerElement;
    const value = parseValue(attr.value);
    console.log("TODO: WhenEffector");
    // effectors.push(
    //   new WhenEffector(nodePath(node, root), [name], (_) => _ === value)
    // );
    node.removeAttribute(attr.name);
  }

  // We take care of state change effectors
  // TODO: This won't work for nested templates
  for (const node of iterSelector(root, "*[when]")) {
    const selector = parseSelector(node.getAttribute("when"));
    // const { path, format, value } = parseDirective(node.getAttribute("when"));
    // const predicate = (_) => format(_) === value;
    // effectors.push(new WhenEffector(nodePath(node, root), path, predicate));
    node.removeAttribute("when");
  }

  return new View(root, effectors);
};

// --
// ## Templates

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
// Parses the given `node` and its descendants as a template definition. The
// `parentName` is useful for nested templates where the actual root/component
// template is different.
export const template = (
  node,
  name = node.getAttribute("id"),
  rootName = undefined, // FIXME We're not doing anything with that
  clone = true // TODO: We should probably always have that to false
) => {
  let views = [];
  // NOTE: We skip text nodes there
  const root = node.nodeName.toLowerCase() === "template" ? node.content : node;
  for (let _ of root.children) {
    switch (_.nodeName) {
      case "STYLE":
        break;
      case "SCRIPT":
        document.body.appendChild(_);
        break;
    }
  }

  // If there is  `data-body` attribute, then we'll get a different node
  // to source the children. This is important when using different namespaces,
  // such as `svg` nodes, which need to be within an `svg` parent to
  // implicitly get the SVG namespace (which can still be set explicitely
  // through xmlns).
  const bodyId = node.dataset.body;
  let viewsParent = undefined;
  if (bodyId) {
    const bodyNode = root.getElementById(bodyId);
    if (!bodyNode) {
      onError(`template: Could not resolve data-body="${bodyId}"`, { node });
    } else {
      viewsParent = bodyNode;
    }
  } else {
    viewsParent = root;
  }
  for (let _ of viewsParent?.childNodes || []) {
    switch (_.nodeType) {
      case Node.TEXT_NODE:
        views.push(_);
        break;
      case Node.ELEMENT_NODE:
        switch (_.nodeName.toLowerCase()) {
          case "style":
          case "script":
            break;
          default:
            views.push(_);
        }
        break;
      default:
    }
  }

  const res = new TemplateEffector(
    new Template(
      node,
      views.map((_) => view(clone ? _.cloneNode(true) : _), name),
      name
    )
  );
  if (name) {
    Templates.set(name, res);
  }
  return res;
};

// EOF
