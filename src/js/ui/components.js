import { Templates, createTemplate } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { createComment } from "./utils/dom.js";
import { onError } from "./utils/logging.js";
import { makeKey } from "./utils/ids.js";
import { extractBindings, extractSlots } from "./templates/directives.js";
import { Controllers } from "./controllers.js";

// FIXME: This is redundant with the slot effector.
//
// ============================================================================
// COMPONENTS
// ============================================================================

// --
//
// ## Components
//
// The `Component` class encapsulates an anchor node, a template effector,
// and state context
//
//
export class Component {
	// FIXME: It's not clear what role componetns play
	constructor(
		id,
		anchor,
		template,
		controller,
		store,
		path,
		slots,
		attributes,
	) {
		this.id = id;
		this.anchor = anchor;
		this.template = template;
		this.store = store;
		// TODO: We should really initialize a component with "slots" as bindings.
		// Each binding is then mapped into a local component scope. The scope
		// should resolve from cells first, and if not from the store. Effect
		// scope should be from cells.
		// TODO: State really should be store.
		this.scope = new EffectScope(store).define(slots);
		this.scope.isComponentBoundary = id || template.name || true;
		this.effect = template.apply(this.anchor, this.scope, attributes);
		this.effect.mount();
		// TODO: Not sure we need to alias
		this.controller = this.effect.controller;
	}
}

// --
// Takes a DOM node that typically has a `data-ui` attribute, looks for the
// corresponding template in `Templates` and creates a new `Component`
// replacing the given `node` and then rendering the component.
export const createComponent = (node, store, templates = Templates) => {
	const bindings = extractBindings(node, ["template", "id"]);
	// TODO: What about event handlers?
	const slots = Object.assign(bindings.slots, extractSlots(node));
	const templateName = node.getAttribute("template");
	const id = node.getAttribute("id");

	// --
	// We validate that the template exists.
	const template = templateName
		? templates.get(templateName)
		: createTemplate(node);
	if (!template) {
		onError(
			`ui.render: Could not find template '${templateName}', available templates are ${[
				...templates.keys(),
			].join(", ")}`,
			{
				node,
				templateName,
				templates,
			},
		);
		return null;
	}

	// We create an anchor component, and replace the node with the anchor.
	const key = id ? id : makeKey(templateName);
	const anchor = createComment(`${key}|Component|${templateName}`);
	// We only keep attributes that are HTML attributes
	const attributes = [...node.attributes].reduce((r, v) => {
		if (
			v.name.startsWith("data-") ||
			["class", "style", "id"].indexOf(v.name) !== -1
		) {
			r.set(v.name, v.value);
		}
		return r;
	}, new Map());

	// TODO: We should probably move the  node to a fragment an render
	// the fragment separately before mounting it, so that we minimize DOM
	// changes.
	node.parentElement.replaceChild(anchor, node);

	return new Component(
		key,
		anchor,
		template,
		template.name ? Controllers.get(template.name) : null,
		store,
		undefined,
		slots,
		attributes,
	);
};

// EOF
