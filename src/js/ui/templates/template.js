import { extractLiteralBindings } from "./directives.js";
import { onError } from "../utils/logging.js";
import { TemplateEffector } from "../effectors/template.js";
import { createView } from "./view.js";

// --
// ## Templates

// -- doc
// Keeps track of all the defined templates, which can then
// be reused.
//

// FIXME: I'm not sure we need to keep that class, as it seems that it's
// actually the template effector
export class Template {
	constructor(name, root, views, bindings) {
		this.name = name;
		this.root = root;
		this.views = views;
		this.bindings = bindings;
	}

	get hasEffectors() {
		for (const v of this.views) {
			if (v.effectors.length + v.refs.length > 0) {
				return true;
			}
		}
		return false;
	}
}

// -- doc
// Parses the given `node` and its descendants as a template definition. The
// `name` is useful for nested templates where the actual root/component
// template is different.
//
//NOTE: This is a destructive operation on the original template node.
export const onTemplateNode = (
	processor,
	node,
	name = node.getAttribute("name") || node.getAttribute("id"),
	clone = true, // TODO: We should probably always have that to false
	scriptContainer = document.body
) => {
	// NOTE: We skip text nodes there
	const root =
		node.nodeName.toLowerCase() === "template" ? node.content : node;
	for (const _ of root.children) {
		switch (_.nodeName) {
			case "STYLE":
				// TODO: We may also want to put these in the template
				scriptContainer.appendChild(_);
				break;
			case "SCRIPT":
				// TODO: We may want to put these in the template
				scriptContainer.appendChild(_);
				break;
		}
	}

	// TODO: We should harvest the `in:`, `inout:` and `out:` attributes, which
	// are then the inputs bindings for the template. This should also be
	// optional, as the selected paths can be extracted from thew views.

	// If there is  `data-body` attribute, then we'll get a different node
	// to source the children. This is important when using different namespaces,
	// such as `svg` nodes, which need to be within an `svg` parent to
	// implicitly get the SVG namespace (which can still be set explicitly
	// through xmlns).
	const bodyId = node?.dataset?.body;
	let viewsParent = undefined;
	if (bodyId) {
		const bodyNode = root.getElementById(bodyId);
		if (!bodyNode) {
			onError(`template: Could not resolve data-body="${bodyId}"`, {
				node,
			});
		} else {
			viewsParent = bodyNode;
		}
	} else {
		viewsParent = root;
	}

	// Note that the bindings here may contain selectors as well, which
	// will then be created as derived values in the effector scope.
	const bindings = extractLiteralBindings(node, ["name"]);

	// FIXME: We some times register anonymous templates that we don/t really
	// care about.
	return processor.register(
		name,
		new TemplateEffector(
			new Template(
				name,
				node,
				([...viewsParent?.childNodes] || []).reduce(
					(r, _) => (
						// We only create views from text and element nodes, excluding
						// style and script nodes.
						(_.nodeType === Node.TEXT_NODE &&
							!/^\s*$/.test(_.data)) ||
						(_.nodeType == Node.ELEMENT_NODE &&
							_.nodeName.toLowerCase() !== "style" &&
							_.nodeName.toLowerCase() !== "script")
							? r.push(
									createView(
										processor,
										clone ? _.cloneNode(true) : _,
										name
									)
							  )
							: null,
						r
					),
					[]
				)
			),
			bindings,
			undefined,
			// It is a component if it has a name
			name
		)
	);
};

// EOF
