import {
  parseSelector,
  parseInput,
  CurrentValueSelector,
  INPUT,
  INPUTS,
} from "./selector.js";
import { nodePath } from "./paths.js";
import {
  ContentEffector,
  SlotEffector,
  WhenEffector,
  MatchEffector,
  EventEffector,
  StyleEffector,
  ValueEffector,
  AttributeEffector,
  TemplateEffector,
} from "./effectors.js";
import { onError, makeKey, bool } from "./utils.js";
import { styled } from "./tokens.js";
import { stylesheet } from "./css.js";

// --
// ## Templates
//
// This defines how HTML/XML template definitions are translated into
// a tree of effectors.

// -- doc
// `parseValue` parses a text value into its JavaScript representation. Note
// that this function uses `eval()` and is not safe to use with foreign
// code.
const RE_NUMBER = /^\d+(\.\d+)?$/;
export const parseValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  switch (value) {
    case "true":
      return true;
    case "false":
      return false;
    case "null":
      return null;
    case "undefined":
      return undefined;
  }
  switch (value.at(0)) {
    case '"':
    case "'":
    case "`":
    case "{":
    case "[":
    case "(":
      // SEC: This is subject to injection.
      return eval(value);
    default:
      return RE_NUMBER.test(value) ? parseFloat(value) : value;
  }
};

const Comparators = {
  "=": (a, b) => a == b,
  // TODO: We should probably only accept one?
  "==": (a, b) => a == b,
  "!=": (a, b) => a != b,
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
};

// --
// Parses a `when=TEXT` directive.
const parseWhenDirective = (text) => {
  const match = text.match(
    /^(?<selector>[^=!<>]+)((?<operator>==?|!=|>|>=|<|<=)(?<value>.+)?)?$/
  );
  if (!match) {
    return null;
  } else {
    const { selector, value, operator } = match.groups;
    const v = value ? parseValue(value) : undefined;
    const f = operator ? Comparators[operator] : bool;
    if (!f) {
      onError(`Could not find comparator for '${operator}'`, {
        directive: text,
        groups: match.groups,
      });
      return null;
    }

    return {
      selector: parseSelector(selector) || CurrentValueSelector,
      predicate: (_) => f(_, v),
    };
  }
};

// --
// ### Handling events: `on:EVENT=DIRECTIVE`.
//
// The `on:EVENT=DIRECTIVE` directive is as follows:
//
// - `EVENT` is an event name
// - `DIRECTIVE` is a comma-separated list of mappings `SELECTOR=SELECTOR` and
//    event names.
const RE_INPUT = new RegExp(`^${INPUT}$`);
const RE_EVENT = new RegExp(`^(?<name>([A-Z][A-Za-z]+)+)(?<stops>\\.)?$`);
const parseOnDirective = (text) => {
  const match = text.split(",").reduce(
    (r, v) => {
      let match = undefined;
      const t = v.trim();
      if ((match = t.match(RE_EVENT))) {
        const { name, stops } = match.groups;
        r.events.push(name);
        if (stops) {
          r.stops = true;
        }
      } else if ((match = t.match(RE_INPUT))) {
        r.inputs.push(parseInput(t));
      }
      return r;
    },
    { inputs: [], events: [] }
  );
  if (match.inputs.length || match.events.length || match.stops) {
    return match;
  } else {
    return null;
  }
};

const RE_OUT = new RegExp(`^(?<selector>${INPUTS})(:(?<template>[A-Za-z]+))?$`);
const parseOutDirective = (text) => {
  const match = text.match(RE_OUT);
  if (!match) {
    return null;
  } else {
    const { selector, template } = match.groups;
    return {
      selector: selector ? parseSelector(selector) : null,
      template,
    };
  }
};

// --
// ## Tree Walking
//
// Processing templates requires walking through the nodes in the tree
// and looking for special nodes.

const isBoundaryNode = (node) => {
  if (node && node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node?.parentNode?.tagName;
    switch (tagName) {
      // SVG has lowercase node names, HTML has uppercase
      case "TEMPLATE":
      case "template":
      case "SLOT":
      case "slot":
        return true;
    }
    // x:case="..." nodes are also boundaries
    if (node.hasAttribute("do:case")) {
      return true;
    }
    // When effectors are also boundary nodes, so we stop at any
    // of their children.
    if (node.parentElement && node.parentElement.hasAttribute("when")) {
      return true;
    }
  } else {
    return false;
  }
};

// --
// Returns the boundary node in this node's ancestors.
const getBoundaryNode = (node) => {
  while (node.parentElement && !isBoundaryNode(node.parentElement)) {
    node = node.parentElement;
  }
  return node;
};

// --
// We don't want to recurse through filters.
const TreeWalkerFilter = {
  acceptNode: (node) => {
    return isBoundaryNode(node)
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

const iterNodes = function* (node, ...names) {
  let walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT,
    TreeWalkerFilter
  );
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const name = node.nodeName;
    for (let n of names) {
      if (name === n) {
        yield node;
      }
    }
  }
  // while (node) {
  //   const name = node.nodeName;
  //   console.log("NODE", { node, name });
  //   for (let n of names) {
  //     if (name === n) {
  //       yield node;
  //     }
  //   }
  //   walker.nextNode();
  //   node = walker.currentNode;
  // }
};

// -- doc
// Iterates through the descendants of `node` (including itself), yielding
// nodes that match the given `selector`.
//
// NOTE: This does not stop at boundary nodes (see  `isBoundaryNode`).
export const iterSelector = function* (node, selector) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.matches(selector)) {
      yield node;
    }
    for (const _ of node.querySelectorAll(selector)) {
      yield _;
    }
  }
};

// -- doc
// Tells if the node is empty, stripping text nodes that only have whitespace.
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
// ## Node Operations

const asFragment = (...nodes) => {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    fragment.appendChild(node);
  }
  return fragment;
};

const contentAsFragment = (node) => {
  const fragment = document.createDocumentFragment();
  while (fragment && node.firstChild) {
    fragment.appendChild(node.firstChild);
  }
  return fragment;
};

const replaceNodeWithPlaceholder = (node, placeholder) => {
  const anchor = document.createComment(placeholder);
  node.parentElement.replaceChild(anchor, node);
  return anchor;
};

// Creates the HTML template that is used to render the contents. This
// template can be referenced by name (`data-ui`), or through the
// directive, or through the contents (FIXME).
const getNodeTemplate = (node, template) =>
  node.dataset.ui
    ? node.dataset.ui
    : template
    ? template
    : isNodeEmpty(node)
    ? null // An empty node means a null (text) formatter
    : createTemplate(
        // The format is the template id
        node,
        makeKey("template"),
        false // No need to clone there
      ).name;

// We use the attribute nodes directly, as there is an asymetry in
// HTML where an attribute node may be `on:Send`, but `getAttribute("on:Send")`
// will return `null` (while `getAttribute("on:send")` will return
// the value).
const getNodeEventHandlers = (node) =>
  [...node.attributes].reduce((r, { name, value }) => {
    if (name.startsWith("on:")) {
      const d = parseOnDirective(value);
      if (!d) {
        onError(
          `templates.view: Could not parse on 'on:*' directive '${value}'`,
          {
            node,
            attr: name,
            root,
          }
        );
      } else {
        r = r || {};
        // NOTE: For now we only support relaying the event to the
        // other event, so the handler is basically the path at which we relay.
        r[`${name.at(3).toUpperCase()}${name.substring(4)}`] =
          d.event.split(".");
      }
    }
    return r;
  }, null);

// --
// Processes a `<slot template=... select=.... >` node. The `select` attribute
// defines the data path for which the slot will be applied, if it is suffixed
// with `.*` then the slot will be mapped for each selected item.
const processSlotNode = (node, root) => {
  const selector = parseSelector(node.getAttribute("select"));
  const content = contentAsFragment(node);
  // TODO: Content should be used as placeholder
  const template =
    node.getAttribute("template") ||
    createTemplate(content, makeKey("fragment"), false /*no cloning needed*/);
  const key = makeKey(node.dataset.id || node.getAttribute("name") || template);
  const effector = new SlotEffector(
    nodePath(node, root),
    selector,
    template,
    getNodeEventHandlers(node),
    key
  );
  // We replace the slot by a placeholder node.
  node.parentNode.replaceChild(
    document.createComment(`${key}|Slot|${template}|${selector.toString()}`),
    node
  );

  return effector;
};

// --
// Processes an `out:NAME=SELECTOR` attribute, where `out:content=SELECTOR`
// is a special case where the content of the node will be applied wit the
// value of the selector. Otherwise the handling will be either an
// style, value or regular attribute.
const onOutAttribute = (attr, root) => {
  // The first step is to parse the selector from the `out:NAME=SELECTOR`
  // attribute.
  const node = attr.ownerElement;
  const name = attr.localName;
  const text = attr.value || `.${name}`;
  const directive = parseOutDirective(text);
  node.removeAttribute(attr.name);
  if (!directive) {
    onError(`templates.view: Could not parse 'out:' directive "${text}"`, {
      text,
      attr,
    });
  } else if (!directive.selector) {
    onError(
      `templates.view: Cannot parse selector 'out:' of directive "${text}"`,
      {
        text,
        attr,
      }
    );
  } else if (name === "content") {
    // Now, if we have an `out:content=XXXX`, then it means we're replacing
    // the content with the value or a template applied with the value.
    // We extract the fragment, handlers, and content template
    const fragment = contentAsFragment(node);
    const template = getNodeTemplate(node, directive.template);
    const handlers = getNodeEventHandlers(node);
    const key = makeKey(node.dataset.id || directive.template);
    const anchor = replaceNodeWithPlaceholder(
      node,
      `${key}|${
        template ? "SlotEffector" : "ContentEffector"
      }|${template}|out:content=${text}`
    );
    return template
      ? new SlotEffector(
          nodePath(anchor, root),
          directive.selector,
          template,
          handlers,
          key,
          fragment
        )
      : new ContentEffector(
          nodePath(anchor, root),
          directive.selector,
          fragment
        );
  } else {
    // It's not an `out:content` attribute, then it's either a style, value
    // or attribute effector.
    const nodeName = node.nodeName;
    return new (
      name === "style"
        ? StyleEffector
        : ((name === "value" || name === "disabled") &&
            (nodeName === "INPUT" || nodeName === "SELECT")) ||
          (name === "checked" && nodeName === "INPUT")
        ? ValueEffector
        : AttributeEffector
    )(nodePath(node, root), directive.selector, name);
  }
};

const onDoAttribute = (attr, root) => {
  const node = attr.ownerElement;
  node.removeAttribute(attr.name);
  if (attr.localName === "match") {
    const selector = parseSelector(attr.value);
    if (!selector) {
      onError(
        `templates: Unable to parse selector '${attr.value}' in 'do:match: attribute`,
        { attr }
      );
    } else {
      // We have `do:match=SELECTOR`, we now need to look at the children
      // with a `do:case` attribute. These will be the branches.
      const branches = [...node.childNodes].reduce((r, n, i) => {
        if (n.nodeType == Node.ELEMENT_NODE && n.hasAttribute("do:case")) {
          // If the child  has a do:case, then it's a sub-template and
          // we need to take it out.
          const t = n.getAttribute("do:case");
          const value = parseValue(t);

          const template = createTemplate(
            asFragment(n),
            // FIXME: I'm not sure why we're making a key here, we should probably
            // use the name of the parent template
            `T${templateName || makeKey()}-E${effectors.length}`,
            false // No need to clone there
          );
          replaceNodeWithPlaceholder(n, `#${i}|MatchEffector|${template}|${v}`);

          r.push({
            template,
            value,
            nodeIndex: i,
          });
        }
        return r;
      }, []);
      if (branches.length === 0) {
        return onError(
          `templates: 'do:match=${attr.value}' node has no 'do:case' branch`,
          { node: attr.ownerElement, branches }
        );
      } else {
        return new MatchEffector(
          nodePath(
            replaceNodeWithPlaceholder(
              `|MatchEffector||${selector.toString()}`,
              node
            ),
            root
          ),
          selector,
          branches
        );
      }
    }
  } else {
    return onError(
      `templates: Unsupported '${attr.name}' attribute, 'do:match' is supported`,
      {
        attr,
      }
    );
  }
};

// --
// ## View creation
//
class View {
  constructor(root, refs, effectors) {
    this.root = root;
    this.refs = refs;
    this.effectors = effectors;
  }
}

// -- doc
// Creates a view from the given `root` node, looking for specific
// attribute types (`in:*=`, `out:*=`, `on:*=`, `when=`) and
// creating corresponding effectors.
const view = (root, templateName = undefined) => {
  const effectors = [];
  // Some transforms may change the root, for instance if it's a <slot> root>
  let viewRoot = root;

  // TODO: Query the styled variants

  //--
  // We start by getting all the nodes within the `in`, `out` and `on`
  // namespaces.
  const attrs = {};
  for (const [match, attr] of iterAttributes(
    root,
    /^(?<type>in|out|on|do|styled):(?<name>.+)$/
  )) {
    const type = match.groups.type;
    const name = match.groups.name;
    (attrs[type] = attrs[type] || []).push({ name, attr });
  }

  // NOTE: Disabling this for now
  // // --
  // // ### Styled attributes
  // //
  // // We expand the style attributes, which are then aggregated in the
  // // `styleRules` dict.
  // const styledRules = {};
  // for (const node of iterSelector(root, "*[styled]")) {
  //   const { rules, classes } = styled(node.getAttribute("styled"));
  //   Object.assign(styledRules, rules);
  //   classes.forEach((_) => node.classList.add(_));
  //   node.removeAttribute("styled");
  // }

  // for (const { name, attr } of attrs["styled"] || []) {
  //   const { rules, classes } = styled(attr.value, `:${name}`);
  //   Object.assign(styledRules, rules);
  //   const node = attr.ownerElement;
  //   classes.forEach((_) => node.classList.add(_));
  //   node.removeAttribute("styled");
  // }

  // // If we have more than one `styledRule`, then we declare a stylesheet.
  // if (Object.keys(styledRules).length > 0) {
  //   // NOTE: We should probably put that as part of the view and not
  //   // necessarily create it right away.
  //   stylesheet(styledRules);
  // }

  for (const { attr } of attrs["do"] || []) {
    const effector = onDoAttribute(attr, root);
    effector && this.effectors.push(effector);
  }

  // --
  // ### slot nodes
  //
  for (const node of iterNodes(root, "slot", "SLOT")) {
    effectors.push(processSlotNode(node, root));
  }
  // --
  // ### `out:*` attributes
  //
  // We take care of attribute/content/value effectors
  for (const { attr } of attrs["out"] || []) {
    effectors.push(onOutAttribute(attr, root));
  }

  // --
  // ### Event effectors
  //
  for (const { name, attr } of attrs["on"] || []) {
    const node = attr.ownerElement;
    // A `<slot out:XXX>` node  may have `on:XXX` attribtues as well, in which
    // case they've already been processed at that point.
    if (node && node.parentNode) {
      const directive = parseOnDirective(attr.value);
      if (!directive) {
        onError(
          `templates.view: Could not parse on 'on:*' directive '${attr.value}'`,
          {
            name,
            attr,
            root,
          }
        );
      } else {
        effectors.push(
          new EventEffector(nodePath(node, root), name, directive)
        );
      }
    }
    node.removeAttribute(attr.name);
  }

  // --
  //
  // ### Conditional effectors

  // We take care of state change effectors
  // TODO: This won't work for nested templates
  for (const node of iterSelector(root, "*[when]")) {
    const boundary = getBoundaryNode(node);
    if (boundary === root) {
      const text = node.getAttribute("when");
      const when = parseWhenDirective(text);
      if (!when) {
        onError(`Could not parse when directive '${text}'`, {
          node,
          when: text,
        });
      } else {
        node.removeAttribute("when");
        const frag = document.createDocumentFragment();
        while (node.childNodes.length > 0) {
          frag.appendChild(node.childNodes[0]);
        }
        // TODO: If there is no sub-effectors, we should not bother
        // with a template, it's a waste of resources.
        const subtemplate = createTemplate(
          frag,
          `T${templateName || makeKey()}-E${effectors.length}`,
          false // No need to clone there
        );
        effectors.push(
          new WhenEffector(
            nodePath(node, root),
            when.selector,
            subtemplate,
            when.predicate
          )
        );
      }
    }
  }

  // --
  // Refs
  const refs = new Map();
  for (const node of iterSelector(root, "*[ref]")) {
    refs.set(node.getAttribute("ref").split("."), nodePath(node, root));
    node.removeAttribute("ref");
  }

  return new View(viewRoot, refs, effectors);
};

// --
// ## Templates

// -- doc
// Keeps track of all the defined templates, which can then
// be reused.
//

export const Templates = new Map();

// FIXME: I'm not sure we need to keep that class, as it seems that it's
// actually the template effector
class Template {
  constructor(root, views, name = undefined) {
    this.name = name;
    this.root = root;
    this.views = views;
  }
}

// -- doc
// Parses the given `node` and its descendants as a template definition. The
// `name` is useful for nested templates where the actual root/component
// template is different.
export const createTemplate = (
  node,
  name = node.getAttribute("id"),
  clone = true, // TODO: We should probably always have that to false
  templates = Templates
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
  const bodyId = node?.dataset?.body;
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
    templates.set(name, res);
  }
  return res;
};

// EOF
