import { onError } from "../utils/logging.js";
import { isNodeEmpty, contentAsFragment, createAnchor } from "../utils/dom.js";
import { nodePath } from "../path.js";
import { AttributeEffector } from "../effectors/attribute.js";
import { StyleEffector } from "../effectors/style.js";
import { ValueEffector } from "../effectors/value.js";
import { ContentEffector } from "../effectors/content.js";
import { SlotEffector } from "../effectors/slot.js";
import { findEventHandlers } from "./on.js";
import { parseOutDirective } from "./directives.js";

// --
// Processes an `out:NAME=SELECTOR` attribute, where `out:content=SELECTOR`
// is a special case where the content of the node will be applied with the
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
		const hasTemplate = directive.template;
		const hasContents = !isNodeEmpty(node);
		const contents = contentAsFragment(node);
		const anchor = createAnchor(node);
		if (hasTemplate || hasContents) {
			// It's either an explicit template or an inline template
			return new SlotEffector(
				nodePath(anchor, root),
				directive.selector,
				directive.template ||
					processor.Template(
						processor,
						// The format is the template id
						contents,
						// Anonymous node
						null,
						false // No need to clone there
					),
				// FIXME: Not sure if it should be node or contetns
				findEventHandlers(node)
			);
		} else {
			return new ContentEffector(
				nodePath(anchor, root),
				directive.selector,
				contents
			);
		}
	} else {
		// It's not an `out:content` attribute, then it's either a style, value
		// or attribute effector.
		const nodeName = node.nodeName.toUpperCase();
		// For some reason, `out:viewBox` gets normalized as `out:viewbox`, so we
		// correct it here.
		// FIXME: We should generalize that to support other edge cases
		if (nodeName === "SVG" && name == "viewbox") {
			name = "viewBox";
		}
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
