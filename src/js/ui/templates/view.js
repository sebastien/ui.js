import { iterNodes, iterSelector, iterAttributes } from "./walking.js";
import { nodePath } from "../path.js";
import { onError } from "../utils/logging.js";

// --
// ## View creation
//
class View {
	constructor(root, refs, effectors) {
		this.root = root;
		this.refs = refs;
		this.effectors = effectors;
	}
}

// -- doc
// Creates a view from the given `root` node, looking for specific
// attribute types (`in:*=`, `out:*=`, `on:*=`, `when=`) and
// creating corresponding effectors.
export const createView = (processor, root, templateName = undefined) => {
	// Some transforms may change the root, for instance if it's a <slot> root.
	const container = root.parentElement ? null : document.createElement("div");
	container && container.appendChild(root);

	//--
	// We start by getting all the nodes within the `in`, `out` and `on`
	// namespaces.
	const attrs = {};
	for (const [match, attr] of iterAttributes(
		root,
		/^(?<type>in|out|inout|on|styled|x):(?<name>.+)$/
	)) {
		const type = match.groups.type;
		const name = match.groups.name;
		(attrs[type] = attrs[type] || []).push({ name, attr });
	}

	// TODO: Query the styled variants
	// NOTE: Disabling this for now
	// // --
	// // ### Styled attributes
	// //
	// // We expand the style attributes, which are then aggregated in the
	// // `styleRules` dict.
	// const styledRules = {};
	// for (const node of iterSelector(root, "*[styled]")) {
	//   const { rules, classes } = styled(node.getAttribute("styled"));
	//   Object.assign(styledRules, rules);
	//   classes.forEach((_) => node.classList.add(_));
	//   node.removeAttribute("styled");
	// }

	// for (const { name, attr } of attrs["styled"] || []) {
	//   const { rules, classes } = styled(attr.value, `:${name}`);
	//   Object.assign(styledRules, rules);
	//   const node = attr.ownerElement;
	//   classes.forEach((_) => node.classList.add(_));
	//   node.removeAttribute("styled");
	// }

	// // If we have more than one `styledRule`, then we declare a stylesheet.
	// if (Object.keys(styledRules).length > 0) {
	//   // NOTE: We should probably put that as part of the view and not
	//   // necessarily create it right away.
	//   stylesheet(styledRules);
	// }

	const effectors = [];

	// ### slot nodes

	for (const { name, attr } of attrs["x"] || []) {
		let e = null;
		// FIXME: We should support different attributes
		if (!attr.ownerElement) {
			// If there's not owner element, the attribute is floating
			// and we can ignore it. Although it's not clear when that's
			// supposed to happen.
			continue;
		}
		switch (name) {
			case "if":
				e = processor.If(processor, attr, root, name);
				break;
			case "for":
				e = processor.For(processor, attr, root, name);
				break;
			case "match":
				// NOTE: The match processor will remove x:case, x:when
				// and x:otherwise.
				e = processor.Match(processor, attr, root, name);
				break;
			case "otherwise":
			case "when":
				onError(
					`Attribute used outside of a x:match parent, "x:${name}"`,
					{ attr }
				);
				break;
			default:
				onError(`Unsupported attribute "x:${name}"`, { attr });
		}
		e && effectors.push(e);
	}

	// NOTE: We pre-expand the iterator into an array as onSlotNode
	// is destructive. We want all the slots first and the we process them.
	for (const node of [...iterNodes(root, "slot", "SLOT")]) {
		if (node.hasAttribute("x:for") || node.hasAttribute("x:match")) {
			// We do nothing, we/ve already processed the node
		} else {
			const e = processor.Slot(processor, node, root, templateName);
			e && effectors.push(e);
		}
	}

	// --
	// ### `out:*` attributes
	//
	// We take care of attribute/content/value effectors
	for (const { name, attr } of attrs["out"] || []) {
		const e = processor.Out(processor, attr, root, name);
		e && effectors.push(e);
	}
	// TODO: attr["in"]
	// TODO: attr["inout"]

	// --
	// ### Event effectors
	//
	for (const { name, attr } of attrs["on"] || []) {
		const e = processor.On(processor, attr, root, name);
		e && effectors.push(e);
	}

	// --
	// Refs
	const refs = new Map();
	for (const node of iterSelector(root, "*[ref]")) {
		// TODO: Warning, nodePath requires the node order not to change
		refs.set(node.getAttribute("ref").split("."), nodePath(node, root));
		node.removeAttribute("ref");
	}

	// We use the container so that the root always has a parent, which makes
	// it possible to replace the root node, for instance when the template
	// has a `<slot>` as a root.
	return new View(
		container ? container.childNodes[0] : root,
		refs,
		effectors
	);
};
