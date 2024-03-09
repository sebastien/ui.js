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
	node,
	position = node.childNodes.length,
	context = globals.context,
	effector = globals.effector
) => {
	const ctx = Object.create(context);
	ctx[Cell.Parent] = context;
	ctx[Cell.Input] = data;
	const fragment = document.createDocumentFragment();
	const tmpl = template(component);
	const res = tmpl.render(fragment, position, ctx, effector);
	// Appending only at the end is the best way to speed up the initial rendering.
	node.appendChild(fragment);
	return res;
};

export { h, $, globals, render };
// EOF
