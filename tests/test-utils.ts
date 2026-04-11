import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";

export const installDom = () => {
	domish.install();
};

export const mountWithHandle = (Component, data) => {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();

	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "test";
	ctx[Slot.Input] = data;

	const parent = document.createElement("div");
	const node = effect.render(parent, 0, ctx, effector);
	if (node && !node.parentNode) {
		parent.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);

	return { effect, effector, ctx, parent, derivedContext };
};

export const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

export const walk = (root, visitor) => {
	root.iterWalk((node) => {
		const res = visitor(node);
		return res;
	});
};

export const findFirstByNodeName = (root, name) => {
	let match;
	walk(root, (node) => {
		if (node.nodeName.toLowerCase() === name.toLowerCase()) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

export const findAllByNodeName = (root, name) => {
	const matches = [];
	walk(root, (node) => {
		if (node.nodeName.toLowerCase() === name.toLowerCase()) {
			matches.push(node);
		}
		return undefined;
	});
	return matches;
};

export const findByText = (root, nodeName, text) => {
	const matches = [];
	walk(root, (node) => {
		if (
			node.nodeName.toLowerCase() === nodeName.toLowerCase() &&
			node.textContent === text
		) {
			matches.push(node);
		}
		return undefined;
	});
	return matches;
};
