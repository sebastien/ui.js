import { parseSelector } from "../selector.js";
import { onError } from "../utils/logging.js";
import { TemplateEffector } from "../effectors.js";
import { createView } from "./view.js";

// --
// ## Templates

// -- doc
// Keeps track of all the defined templates, which can then
// be reused.
//

export const parseTemplate = (template) => {
  const match = template ? template.match(/^\{(?<selector>.+)\}$/) : null;
  return match ? parseSelector(match.groups.selector) : template;
};

// FIXME: I'm not sure we need to keep that class, as it seems that it's
// actually the template effector
export class Template {
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
export const onTemplateNode = (
  processor,
  node,
  name = node.getAttribute("name") || node.getAttribute("id"),
  clone = true, // TODO: We should probably always have that to false
  scriptContainer = document.body
) => {
  const views = [];

  // NOTE: We skip text nodes there
  const root = node.nodeName.toLowerCase() === "template" ? node.content : node;
  for (const _ of root.children) {
    switch (_.nodeName) {
      case "STYLE":
        // TODO: We may also want to put these in the template
        break;
      case "SCRIPT":
        // TODO: We may want to put these in the template
        scriptContainer.appendChild(_);
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

  // This filters out the contents of the views parent.
  for (const _ of viewsParent?.childNodes || []) {
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

  // We build the template effector, which will create a new instance of
  // each view and then add it.
  const processedViews = views.map((_) =>
    createView(processor, clone ? _.cloneNode(true) : _, name)
  );

  const res = new TemplateEffector(
    new Template(
      // FIXME: Not sure why we have the node here, when we could have views?
      node,
      // FIXME: Not sure why we need to clone here or not, should explain
      processedViews,
      name
    )
  );

  processor.register(res);

  return res;
};

// EOF
