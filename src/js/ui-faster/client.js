import { DOMEffector } from "./effectors.js";
import { h } from "./vdom.js";
import { template, $ } from "./templates.js";
import { Cell } from "./cells.js";

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
	ctx[Cell.Parent] = context;
	ctx[Cell.Input] = data;
	if (!ctx[Cell.Node]) {
		ctx[Cell.Node] = document.createDocumentFragment();
	}
	const node = ctx[Cell.Node];
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
