import { Effect, Effector } from "../effectors.js";
import { pathNode } from "../path.js";
import { DOM } from "../utils/dom.js";
import { onError, onWarning } from "../utils/logging.js";
import { assign } from "../utils/collections.js";

export class ViewEffector extends Effector {
	constructor(nodePath, selector, view) {
		super(nodePath, selector);
		this.view = view;
	}
	apply(node, scope) {
		const view = this.view;
		const root = view.root.cloneNode(true);
		//
		// And getting a list of the root node for each effector.
		const nodes = view.effectors.map((_, i) => {
			const n = pathNode(_.nodePath, root);
			if (!n) {
				onWarning(
					`Effector #${i} cannot resolve the following path from the root`,
					{ path: _.nodePath, root }
				);
			}
			return n;
		});

		// We update the `data-template` and `data-path` attributes, which is
		// used by `EventEffectors` in particular to find the scope.
		if (root.nodeType === Node.ELEMENT_NODE) {
			// If the effect has attributes registered, we defined them.
			if (view.attributes) {
				for (const [k, v] of view.attributes.entries()) {
					if (k === "class") {
						const w = root.getAttribute("class");
						root.setAttribute(k, w ? `${w} ${v}` : v);
					} else if (!root.hasAttribute(k)) {
						root.setAttribute(k, v);
					}
				}
			}
		}

		// --
		// ### Refs
		//
		// We extract refs from the view and register them as corresponding
		// entries in the local state. We need to do this first, as effectors
		// may use specific refs.
		// FIXME: Do we really need to pass the `refs`?
		const refs = {};
		for (const [k, p] of view.refs.entries()) {
			const n = pathNode(p, root);
			assign(refs, k, n);
			scope.state.put([scope.localPath, `#${k}`], n);
		}

		// We add the view, which will be collected in the template effector.
		return new ViewEffect(
			this,
			node,
			scope,
			root,
			refs,
			nodes,
			view.effectors.map((effector, i) => {
				const node = nodes[i];
				!node &&
					onError("Effector does not have a node", {
						node,
						i,
						effector,
					});
				return effector.apply(node, scope);
			})
		).init();
	}
}

class ViewEffect extends Effect {
	constructor(effector, node, scope, root, refs, nodes, effects) {
		super(effector, node, scope);
		this.root = root;
		this.refs = refs;
		this.nodes = nodes;
		this.effects = effects;
	}
	unify(value, previous) {
		// Nothing to do here, this will be handled by the effects as they
		// subscribe.
	}
	bind() {
		// NOTE: Effects are already bound the first time when `effector.apply()` is called.
		this.effects.forEach((_) => _.bound === 0 && _.bind());
		return super.bind();
	}
	unbind() {
		this.effects.forEach((_) => _.unbind());
		return super.unbind();
	}
	mount() {
		const mounted = this.mounted;
		const res = super.mount();
		DOM.mount(this.node, this.root);
		!mounted && this.effects.forEach((_) => _.mount());
		return res;
	}
	unmount() {
		this.mounted && this.effects.forEach((_) => _.unmount());
		DOM.unmount(this.root);
		return super.unmount();
	}
	dipose() {
		this.effects.forEach((_) => _.dispose());
		return super.dispose();
	}
}

// EOF
