import { parseSelector, parseLiteral, parseExpression } from "./directives.js";
import { nodePath } from "../path.js";
import { asFragment, replaceNodeWithPlaceholder } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";
import { MatchEffector } from "../effectors/match.js";

export const onMatchAttribute = (processor, attr, root, templateName) => {
	const node = attr.ownerElement;
	const selector = parseSelector(attr.value);
	const branches = [];
	// We extract the branches from the match
	for (const child of node.childNodes) {
		let guard = undefined;
		// TODO: We should prune empty nodes
		// It's not an element, we skip it
		if (child.nodeType !== Node.ELEMENT_NODE) {
			continue;
			// It's a case branch (compare by value)
		} else if (child.hasAttribute("x:case")) {
			guard = parseLiteral(child.getAttribute("x:case"));
			child.removeAttribute("x:case");
			// It's a when branch (predicate)
		} else if (child.hasAttribute("x:when")) {
			guard = new Function(
				...selector.fields.concat([
					`return (${parseExpression(child.getAttribute("x:when"))})`,
				])
			);
			child.removeAttribute("x:when");
			// It's the default case
		} else if (child.hasAttribute("x:otherwise")) {
			guard = true;
			child.removeAttribute("x:otherwise");
			// TODO: We should warn against too many otherwise
		}
		// We remove the child from the parent
		child.parentNode.removeChild(child);
		// We remove the attribute so that it/s not parsed twice.
		node.removeAttribute(attr.name);
		if (guard !== null) {
			branches.push({
				guard,
				template: processor.Template(
					processor,
					// TODO: Distinguish slots vs the rest?
					child.nodeName == "slot" || child.nodeName === "SLOT"
						? child
						: asFragment(child),
					// Unnamed template
					null,
					false /* we do not need to clone this node */
				),
			});
		}
	}
	const key = makeKey("when");
	const path = nodePath(node, root);
	replaceNodeWithPlaceholder(node, `${key}|When`);
	node.setAttribute("x:processed", "true");
	return new MatchEffector(path, selector, branches);
};
