import { parseSelector, parseLiteral, parseExpression } from "./directives.js";
import { nodePath } from "../path.js";
import { asFragment, replaceNodeWithPlaceholder } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";
import { MatchEffector } from "../effectors/match.js";

export const onMatchAttribute = (processor, attr, root, templateName) => {
  const node = attr.ownerElement;
  const selector = parseSelector(attr.value);
  const branches = [];
  for (const child of node.childNodes) {
    let guard = undefined;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    } else if (child.hasAttribute("x:case")) {
      guard = parseLiteral(child.getAttribute("x:case"));
      child.removeAttribute("x:case");
    } else if (child.hasAttribute("x:when")) {
      guard = new Function(
        ...selector.fields.concat([
          `return (${parseExpression(child.getAttribute("x:when"))})`,
        ])
      );
      child.removeAttribute("x:when");
    } else if (child.hasAttribute("x:otherwise")) {
      guard = true;
      child.removeAttribute("x:otherwise");
    }
    child.parentNode.removeChild(child);

    if (guard !== null) {
      branches.push({
        guard,
        template: processor.Template(
          processor,
          // TODO: Distinguish slots vs the rest?
          child.nodeName == "slot" || child.nodeName === "SLOT"
            ? child
            : asFragment(child),
          child.nodeName,
          false /* we do not need to clone this node */
        ),
      });
    }
  }
  const key = makeKey("when");
  const path = nodePath(node, root);
  replaceNodeWithPlaceholder(node, `${key}|When`);
  return new MatchEffector(path, selector, branches);
};
