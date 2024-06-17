import { DOMEffector } from "./effectors.js";
import { h } from "./vdom.js";
import { template, $ } from "./templates.js";
import { Slot } from "./cells.js";

const globals = {
	context: {},
	effector: new DOMEffector(),
};

const render = (
	component,
	data,
	parent,
	position = parent.childNodes.length,
	context = globals.context,
	effector = globals.effector
) => {
	const tmpl = template(component);
	const ctx = (context[tmpl.id] = context[tmpl.id] ?? Object.create(context));
	ctx[Slot.Parent] = context;
	ctx[Slot.Input] = data;
	if (!ctx[Slot.Node]) {
		ctx[Slot.Node] = document.createDocumentFragment();
	}
	const node = ctx[Slot.Node];
	const res = tmpl.render(node, position, ctx, effector);
	// Appending only at the end is the best way to speed up the initial rendering.
	if (!node.parentElement) {
		// NOTE: The fragment will be emptied from its contents.
		parent.appendChild(node);
	}
	return res;
};

export { h, $, globals, render };
// EOF
