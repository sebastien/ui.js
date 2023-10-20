import { onError } from "../utils/logging.js";
import { isNodeEmpty, contentAsFragment, createAnchor } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";
import { SELECTOR, parseSelector } from "../selector.js";
import { nodePath } from "../path.js";
import {
  AttributeEffector,
  StyleEffector,
  ValueEffector,
  ContentEffector,
  SlotEffector,
} from "../effectors.js";
import { onTemplateNode } from "./template.js";
import { findEventHandlers } from "./on.js";

const RE_OUT = new RegExp(`^${SELECTOR}(:(?<template>[A-Za-z]+))?$`);
export const parseOutDirective = (text) => {
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
// Processes an `out:NAME=SELECTOR` attribute, where `out:content=SELECTOR`
// is a special case where the content of the node will be applied wit the
// value of the selector. Otherwise the handling will be either an
// style, value or regular attribute.
export const onOutAttribute = (processor, attr, root, name) => {
  // The first step is to parse the selector from the `out:NAME=SELECTOR`
  // attribute.
  const node = attr.ownerElement;
  const text = attr.value || `.${name}`;
  // If the attribute has no owner node, it already has been processed
  if (!node) {
    return null;
  }
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
    const template = node?.dataset?.ui
      ? node.dataset.ui
      : directive.template
      ? directive.template
      : isNodeEmpty(node)
      ? null // An empty node means a null (text) formatter
      : onTemplateNode(
          processor,
          // The format is the template id
          contentAsFragment(node),
          makeKey("template"),
          false // No need to clone there
        ).name;
    const handlers = findEventHandlers(node);
    const anchor = createAnchor(node, `out:content=${text}`);

    // The rules should be a little bit more refined:
    // - If there is a template, then the content could be the placholder
    // - If the node name is slot, then it is for sure a slot effector
    return template
      ? new SlotEffector(
          nodePath(anchor, root),
          directive.selector,
          template,
          handlers
        )
      : new ContentEffector(nodePath(node, root), directive.selector);
  } else {
    // It's not an `out:content` attribute, then it's either a style, value
    // or attribute effector.
    const nodeName = node.nodeName;
    return new (
      name === "style" || name.startsWith("style-")
        ? StyleEffector
        : ((name === "value" || name === "disabled") &&
            (nodeName === "INPUT" || nodeName === "SELECT")) ||
          (name === "checked" && nodeName === "INPUT")
        ? ValueEffector
        : AttributeEffector
    )(nodePath(node, root), directive.selector, name);
  }
};

// EOF
