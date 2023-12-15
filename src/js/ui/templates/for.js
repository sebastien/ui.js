import { parseForDirective } from "./directives.js";
import { nodePath } from "../path.js";
import { SlotEffector } from "../effectors/slot.js";
import { findEventHandlers } from "./on.js";
import { DOM, contentAsFragment, createAnchor } from "../utils/dom.js";

export const onForAttribute = (processor, attr, root) => {
	const node = attr.ownerElement;
	const text = attr.name;
	const selector = parseForDirective(attr.value);
	// For selectors are always many, and will assign to `_` in case
	// of no explicit target.
	selector.isMany = true;
	selector.target = selector.target || "_";
	node.removeAttribute(attr.name);
	// We retrieve the content
	const handlers = findEventHandlers(node);
	// TODO: Should prune the content, there may be empty text nodes in there
	const content = contentAsFragment(node);
	// We create an anchor and add it as a child if it's not a slot
	// otherwise we replace the slot.
	const anchor = createAnchor(node, `x:for=${text}`);
	if (node.nodeName === "slot" || node.nodeName === "SLOT") {
		DOM.replace(node, anchor);
	} else {
		node.appendChild(anchor);
	}
	return new SlotEffector(
		nodePath(anchor, root),
		selector,
		processor.Template(
			processor,
			content,
			null,
			false // No need to clone there
		),
		handlers
	);
};

// EOF
