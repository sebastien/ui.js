import { Effect } from "./effects.js";
import { Slot } from "./cells.js";
import { onError } from "./utils/logging.js";

export class VNode {
	// --
	// Returns a list of effects defined in the given node, recursively.
	static Effects(node, path = [], res = []) {
		for (const [k, v] of node.attributes.entries()) {
			if (v instanceof Effect) {
				res.push([[...path, k], v]);
			}
		}
		for (let i = 0; i < node.children.length; i++) {
			const v = node.children[i];
			const p = [...path];
			if (node.name === "#fragment") {
				p.push(i + ((p.at(-1) || 0) + (p.pop() || 0)));
			} else {
				p.push(i);
			}
			if (v instanceof Effect) {
				res.push([p, v]);
			} else if (v instanceof VNode) {
				VNode.Effects(v, p, res);
			}
		}
		return res;
	}

	static ResolvePath(node, path) {
		return path.reduce((r, v) => {
			return v instanceof Array
				? v[0]
					? r.getAttributeNodeNS(v[0], v[1])
					: r.getAttributeNode(v[1])
				: r.childNodes[v];
		}, node);
	}

	constructor(ns, name, attributes, children) {
		this.ns = ns;
		this.name = name;
		this.attributes = attributes || new Map();
		this.children = children || [];
		this._template = undefined;
		this._effects = undefined;
	}

	get template() {
		if (this._template === undefined) {
			this._template = this.materialize();
		}
		return this._template;
	}

	get effects() {
		if (this._effects === undefined) {
			this._effects = VNode.Effects(this);
		}
		return this._effects;
	}

	clone() {
		return this.template.cloneNode(true);
	}

	materialize() {
		const node =
			this.name === "#fragment"
				? document.createDocumentFragment()
				: this.ns
				? document.createElementNS(this.ns, this.name)
				: document.createElement(this.name);
		// NOTE: Maybe if it's a fragment we should add one for the marker
		for (const [[ns, name], value] of this.attributes.entries()) {
			ns
				? node.setAttributeNS(ns, name, value)
				: node.setAttribute(name, value);
		}
		for (const child of this.children) {
			if (child instanceof Effect) {
				node.appendChild(document.createComment(`Effect:${child}`));
			} else if (child instanceof Node) {
				node.appendChild(child.cloneNode(true));
			} else if (child instanceof VNode) {
				node.appendChild(child.clone());
			} else if (child !== null && child !== undefined) {
				node.appendChild(document.createTextNode(`${child}`));
			} else {
				// pass: this null or undefined.
			}
		}
		return node;
	}

	// NOTE: Only for the VNode.render we need an extra `id` argument, as
	// the VNode has no id, so it is just using the parent `id`.
	render(parent, position, context, effector, id) {
		// This will create the VNode if it doesn't exist, rendering effects
		// as they go. Otherwise only the effects will be renderer, and the
		// node will be attached to the parent.
		const existing = context[id + Slot.Node];
		if (!existing) {
			const node = this.clone();
			for (const [path, effect] of this.effects) {
				// Path is like `[int|[str|undefined,str]]`
				const child = VNode.ResolvePath(node, path);
				effect.render(child, position, context, effector);
				switch (child.nodeType) {
					case Node.ATTRIBUTE_NODE:
						break;
					case Node.COMMENT_NODE:
						// FIXME: If we remove the placeholder, then some
						// effects will have problems, like conditionals and
						// mapping. The others should be fine without.
						break;
					default:
						onError(
							"vdom",
							"Effect bound to unsupported node type",
							{ NodeType: child.nodeType }
						);
						break;
				}
			}
			context[id + Slot.Node] = node;
			return effector.appendChild(parent, node, position);
		} else {
			for (const [path, effect] of this.effects) {
				const child = VNode.ResolvePath(existing, path);
				effect.render(child, position, context, effector);
			}
			if (!existing.parentNode) {
				effector.appendChild(parent, existing, position);
			}
			return existing;
		}
	}

	unrender(context, effector, id) {
		const existing = context[id + Slot.Node];
		if (existing && existing.parentNode) {
			existing.parentNode.removeChild(existing);
			for (const [_, effect] of this.effects) {
				effect.unrender(context, effector);
			}
		}
	}
}

// EOF
