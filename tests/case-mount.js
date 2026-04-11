import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";

export const mountCase = (Component, root, data = {}) => {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();

	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "case";
	ctx[Slot.Input] = data;

	const node = effect.render(root, 0, ctx, effector);
	if (node && !node.parentNode) {
		root.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);

	return { effect, effector, ctx, derivedContext };
};
