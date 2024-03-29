import { parseSelector } from "./directives.js";
import { nodePath } from "../path.js";
import {
	asFragment,
	contentAsFragment,
	replaceNodeWithPlaceholder,
} from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";
import { IfEffector } from "../effectors/if.js";

export const onIfAttribute = (processor, attr, root) => {
	const selector = parseSelector(attr.value);
	const node = attr.ownerElement;
	const key = makeKey("if");
	const path = nodePath(node, root);
	node.removeAttribute(attr.name);
	replaceNodeWithPlaceholder(node, `${key}|If`);
	const template = processor.Template(
		processor,
		node.nodeName === "slot" || node.nodeName === "SLOT"
			? contentAsFragment(node)
			: asFragment(node),
		// Unnamed template
		null,
		false /* we do not need to clone this node */
	);
	return new IfEffector(path, selector, template);
};
