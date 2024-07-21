import { DOMEffector } from "./effectors.js";
import { parameters } from "./markup.js";
import { template } from "./hyperscript.js";
import { Slot } from "./cells.js";

const globals = {
	context: {},
	effector: new DOMEffector(),
};

/*
 * What should be fixed:
 * - Markup components and JavaScript components should generate the same values
 * - Both should return a TemplateEffect with an Injection as input that remaps
 *   the input to cells.
 * - The template effect has a `.template` attribute that contains anything
 *   that can be rendered, wether a vnode or not.
 * - Render should create the root context, and simply call `TemplateEffect.render(node,position,context,effector)`
 */
const render = (
	component,
	data,
	parent,
	position = parent.childNodes.length,
	context = globals.context,
	effector = globals.effector
) => {
	// First step, we extract the parameters from the parent node, and we
	// assign merge in the given input data.
	const input = parameters(parent);
	if (data instanceof Array) {
		Object.assign(input, data[0]);
		if (data.length > 1) {
			input.children = data.slice(1);
		}
	} else {
		Object.assign(input, data);
	}
	console.log("INPUT", input);
	// We create an instance of the component, which is going to be
	// an effect mapped with the given input.
	const effect = template(component)(input);
	console.log("EFFECT", effect);

	// We setup a context
	const ctx = (context[effect.id] =
		context[effect.id] ?? Object.create(context));
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = context;
	// FIXME: Not even sure we need this
	ctx[Slot.Input] = input;
	// We create the parent node
	const node = (ctx[Slot.Node] =
		ctx[Slot.Node] ||
		// The effector will detect if the parent is a DocumentFragment, and if
		// the `ui*` fields have been set, this will be used instead.
		Object.assign(document.createDocumentFragment(), {
			// FIXME: We should only assign these after so that we can insert
			// the fragment all at once instead of incrementally, this really
			// improves performance, see `09a0be19a241a8d8c0a7dc82caf156e8acc11177`
			// uiParentElement: parent,
			// uiParentOffset: position,
		}));
	const res = effect.render(node, position, ctx, effector);
	// Appending only at the end is the best way to speed up the initial rendering.
	if (!node.parentElement) {
		// NOTE: The fragment will be emptied from its contents.
		parent.appendChild(node);
	}
	console.log("RES", { res, node });
	return res;
};

export { globals, render };
// EOF
