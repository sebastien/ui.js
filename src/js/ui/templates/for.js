import { parseForDirective } from "./directives.js";
import { onTemplateNode } from "./template.js";
import { makeKey } from "../utils/ids.js";
import { nodePath } from "../path.js";
import { SlotEffector } from "../effectors/slot.js";
import { findEventHandlers } from "./on.js";
import { DOM, contentAsFragment, createAnchor } from "../utils/dom.js";

export const onForAttribute = (processor, attr, root, name) => {
  const node = attr.ownerElement;
  const text = attr.name;
  const selector = parseForDirective(attr.value);
  node.removeAttribute(attr.name);
  const anchor = createAnchor(node, `x:for=${text}`);
  if (node.nodeName === "slot" || node.nodeName === "SLOT") {
    DOM.replace(node, anchor);
  } else {
    node.appendChild(anchor);
  }
  const handlers = findEventHandlers(node);
  return new SlotEffector(
    nodePath(anchor, root),
    selector,
    onTemplateNode(
      processor,
      contentAsFragment(node),
      makeKey("forTemplate"),
      false // No need to clone there
    ),
    handlers
  );
};

// EOF
