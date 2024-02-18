import { parseSelector, extractBindings, parseLiteral } from "./directives.js";
import { createView } from "./view.js";
import { nodePath } from "../path.js";
import { SlotEffector } from "../effectors/slot.js";
import { ViewEffector } from "../effectors/view.js";
import { DOM, replaceNodeWithPlaceholder } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";

// --
// Processes a `<slot template=... select=.... >` node. The `select` attribute
// defines the data path for which the slot will be applied, if it is suffixed
// with `.*` then the slot will be mapped for each selected item.
export const onSlotNode = (processor, node, root, templateName) => {
	// We retrieve the `template` and `selector` from the attributes.
	const template = parseLiteral(node.getAttribute("template"));

	// FIXME: I'm not even sure we're using that anymore
	const selector = node.hasAttribute("selector")
		? parseSelector(node.getAttribute("selector"))
		: null;

	const bindings = extractBindings(node, ["template", "selector"]);
	// NOTE: We should probably remove the attributes
	// for (const attr of [...(node.attributes || [])]) {
	// 	node.removeAttribute(attr.name);
	// }

	// If the node has a `template` node, then the contents will be interpreted
	// as the inputs to be given to the template upon rendering.
	if (template) {
		for (const child of [...node.children]) {
			if (
				(child.nodeName === "SLOT" || child.nodeName == "slot") &&
				child.hasAttribute("name")
			) {
				// NOTE: This may be a performance issue.
				// If we're passing data through nested slots it's going to
				// be a nested template. The reason for that is that we don't know
				// what will be done with that slot. It could be passed down, it
				// could be rendered once, or many times.
				const container = document.createElement("div");
				while (child.firstChild) {
					if (
						child.firstChild.nodeType === Node.ELEMENT_NODE &&
						// When a node has `x:skip` it won't be included in
						// the template.
						// FIXME: Make sure this is the case everywhere
						child.firstChild.hasAttribute("x:skip")
					) {
						DOM.mount(container, [...child.firstChild.childNodes]);
						DOM.unmount(child.firstChild);
					} else {
						container.appendChild(child.firstChild);
					}
				}
				const name = child.getAttribute("name");
				// TODO: If the container has just one child and the child
				// has an element we should unwrap it.
				bindings[name] = new ViewEffector(
					null,
					null,
					createView(processor, container, `${templateName}.{name}`)
				);
				node.removeChild(child);
			}
		}
	} else if (node.childNodes.length === 0) {
		// This is an empty slot node with no template, so we don/t needed
		// to do anything, actually.
		return null;
	} else {
		// If there is no template, then the slot contains the template.
		console.warn("TODO: Slot", node.outerHTML, node);
	}
	// We remove the slot node from the template object, as we don't
	// want it to appear in the output. We replace it with a placeholder.
	const key = makeKey(
		node.dataset.id || node.getAttribute("name") || template
	);

	const path = nodePath(node, root);
	replaceNodeWithPlaceholder(
		node,
		`${key}|Slot|${template?.name || template || "_"}|${
			selector ? selector.toString() : "."
		}`
	);
	// TODO: Like for components, we may have <slot name="XXX"> which then
	// contain a slot effector. That slot effector should then be put
	// as a value in the scope, and when content is rendered the content
	// rendering should apply the effector.
	if (!template && node.children.length === 0) {
		console.warn(
			"[ui.js/slot] Slot may be missing 'template' attribute, as it does not have any contents",
			node
		);
	}
	return new SlotEffector(path, selector, template, undefined, bindings);

	// NOTE: Previous behaviour, left for reference
	// const select = node.getAttribute("select");
	// if (select) {
	//   const selector = parseSelector(select);
	//   const content = contentAsFragment(node);
	//   // TODO: Content should be used as placeholder
	//   const template =
	//     parseTemplate(node.getAttribute("template")) ||
	//     createTemplate(
	//       content,
	//       makeKey(templateName ? `${templateName}_fragment` : "fragment"),
	//       false /*no cloning needed*/
	//     );

	//   console.log("SLOT TEMPLATE", node, template);
	//   const key = makeKey(
	//     node.dataset.id || node.getAttribute("name") || template
	//   );
	//   const effector = new SlotEffector(
	//     nodePath(node, root),
	//     selector,
	//     template,
	//     getNodeEventHandlers(node),
	//     key
	//   );

	//   // We replace the slot by a placeholder node. This means that there should
	//   // be no slot placeholder at that point.
	//   replaceNodeWithPlaceholder(
	//     node,
	//     `${key}|Slot|${template.name || template}|${selector.toString()}`
	//   );
	//   return effector;
	// } else {
	//   return null;
	// }
};

// EOF
