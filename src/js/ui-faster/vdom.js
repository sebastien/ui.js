import { Effect, FormattingEffect } from "./effects.js";
import { Cell } from "./cells.js";
import { isObject } from "./utils/types.js";
import { onError } from "./utils/logging.js";

export class VNode {
	static Effects(node, path = [], res = []) {
		for (let i = 0; i < node.children.length; i++) {
			const v = node.children[i];
			if (v instanceof Effect) {
				res.push([[...path, i], v]);
			} else if (v instanceof VNode) {
				VNode.Effects(v, [...path, i], res);
			}
		}
		return res;
	}

	constructor(ns, name, attributes, children) {
		this.ns = ns;
		this.name = name;
		this.attributes = new Map();
		for (const k in attributes) {
			let [ns, name] = k.split(":");
			if (!name) {
				name = ns;
				ns = undefined;
			}
			if (name === "_") {
				name = "class";
			}
			this.attributes.set([ns, name], attributes[k]);
		}
		// We make sure that cells are wrapped in formatting effects.
		this.children = children.map((_) =>
			_ instanceof Effect
				? _
				: _ instanceof Cell
				? new FormattingEffect(_)
				: _
		);
		this.template = this.materialize();
		this._effects = null;
	}

	get effects() {
		if (!this._effects) {
			this._effects = VNode.Effects(this);
		}
		return this._effects;
	}

	clone() {
		return this.template.cloneNode(true);
	}

	materialize() {
		const node = document.createElement(this.name);
		for (const [[ns, name], value] of this.attributes.entries()) {
			ns
				? node.setAttributeNS(ns, name, value)
				: node.setAttribute(name, value);
		}
		for (const child of this.children) {
			if (child instanceof Effect) {
				node.appendChild(document.createComment(child.toString()));
			} else if (child instanceof Node) {
				node.appendChild(child.cloneNode(true));
			} else if (child instanceof VNode) {
				node.appendChild(child.clone());
			} else if (child !== null && child !== undefined) {
				node.appendChild(document.createTextNode(`${child}`));
			} else {
				onError([VNode, "materialize"], "Unsupported node type", {
					child,
				});
			}
		}
		return node;
	}

	render(parent, position, context, effector) {
		const node = this.clone();
		for (const [path, effect] of this.effects) {
			const child = path.reduce((r, v) => r.childNodes[v], node);
			effect.render(child, position, context, effector);
			// FIXME: This should probably be replacing the placeholder?
			// It's a first render, so we keep track of the placeholder
			child.parentNode.removeChild(child);
		}
		return effector.appendChild(parent, node);
	}
}

class VDOMFactoryProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		if (scope.has(property)) {
			return scope.get(property);
		} else {
			const res = (attributes, ...args) =>
				attributes !== null &&
				attributes !== undefined &&
				isObject(attributes)
					? new VNode(this.namespace, property, attributes, args)
					: new VNode(this.namespace, property, null, [
							attributes,
							...args,
					  ]);
			scope.set(property, res);
			return res;
		}
	}
}
export const h = new Proxy(new Map(), new VDOMFactoryProxy());
// EOF
