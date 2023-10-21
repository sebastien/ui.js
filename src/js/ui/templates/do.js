import { nodePath } from "../path.js";
import { MatchEffector } from "../effectors/match.js";
import { Any } from "../utils/values.js";
import { onError } from "../utils/logging.js";
import { makeKey } from "../utils/ids.js";
import { parseValue, parseSelector } from "./directives.js";
import { onTemplateNode } from "./template.js";
import {
  asFragment,
  createAnchor,
  replaceNodeWithPlaceholder,
} from "../utils/dom.js";

// FIXM:E: This is a actually a match effector
export const onDoAttribute = (processor, attr, root, templateName) => {
  const node = attr.ownerElement;
  if (attr.localName === "match" || attr.name === "do:match") {
    node.removeAttribute(attr.name);
    const selector = parseSelector(attr.value);
    if (!selector) {
      onError(
        `templates: Unable to parse selector '${attr.value}' in 'do:match: attribute`,
        { attr }
      );
    } else {
      // TODO: Support namespaces
      // --
      // We have `do:match=SELECTOR`, we now need to look at the children
      // with a `do:case` attribute. These will be the branches.
      const branches = [...node.childNodes].reduce((r, n, i) => {
        if (
          n.nodeType == Node.ELEMENT_NODE &&
          (n.hasAttribute("do:case") || n.hasAttribute("do:otherwise"))
        ) {
          // If the child  has a do:case, then it's a sub-template and
          // we need to take it out.
          const t =
            n.getAttribute("do:case") ||
            (n.hasAttribute("do:otherwise") && "*");
          n.removeAttribute("do:case");
          n.removeAttribute("do:otherwise");
          const value = t == "*" ? Any : parseValue(t);
          const template = onTemplateNode(
            processor,
            asFragment(n),
            // FIXME: I'm not sure why we're making a key here, we should probably
            // use the name of the parent template
            makeKey(templateName ? `${templateName}:case=${t}` : `case=${t}`),
            false // No need to clone there
          );
          replaceNodeWithPlaceholder(n, template.name);
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
        // If the node is a slot, we replace it with the anchor, otherwise
        // we add the anchor at the end.
        // TODO: If it's a slot, we should replace the slot with a placeholder,
        // otherwise we should append the anchor
        return new MatchEffector(
          nodePath(createAnchor(node, `do:match=${attr.value}`), root),
          selector,
          branches
        );
      }
    }
  } else if (attr.localName === "case" || attr.name === "do:case") {
    // We do nothing, this should already have been processed
  } else {
    return onError(
      `templates: Unsupported '${attr.name}' attribute, 'do:match', 'do:case' and 'do:otherwise' are supported`,
      {
        attr,
      }
    );
  }
};

// EOF
