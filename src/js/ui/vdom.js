import { Slot } from "./cells.js";
import { Effect } from "./effects.js";
import { applyAttributeValue } from "./utils/dom.js";

const isRenderable = (value) =>
	value instanceof Slot && typeof value.render === "function";

export class VNode {
	// Effect target resolution notes:
	// - We intentionally avoid resolving effect targets incrementally while rendering.
	//   Doing so makes target lookup sensitive to DOM mutations caused by earlier
	//   effects in the same pass.
	// - Instead we collect all targets first, then render all effects. This keeps
	//   sentinel-based placeholders (text/comment nodes) stable even when fragments
	//   expand/contract or conditionals alternate.
	// - Cached targets are reused on re-render, but validated against the current
	//   DOM subtree. If user code moved managed nodes, we degrade safely and restore
	//   canonical structure on the next render.

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
			if (v instanceof Effect || isRenderable(v)) {
				res.push([p, v]);
			} else if (v instanceof VNode) {
				VNode.Effects(v, p, res);
			}
		}
		return res;
	}

	static ResolvePath(node, path) {
		let r = node;
		for (let i = 0; i < path.length; i++) {
			const v = path[i];
			r = Array.isArray(v)
				? v[0]
					? r.getAttributeNodeNS(v[0], v[1])
					: r.getAttributeNode(v[1])
				: r.childNodes[v];
		}
		return r;
	}

	static EmittedNodeCount(child) {
		if (child instanceof Effect || isRenderable(child)) {
			return 1;
		}
		if (child instanceof VNode) {
			if (child.name !== "#fragment") {
				return 1;
			}
			let count = 0;
			for (let i = 0; i < child.children.length; i++) {
				count += VNode.EmittedNodeCount(child.children[i]);
			}
			return count;
		}
		if (child instanceof Node) {
			return 1;
		}
		return child !== null && child !== undefined ? 1 : 0;
	}

	static IsValidEffectTarget(target) {
		if (!target || target.nodeType === undefined) {
			return false;
		}
		return true;
	}

	static IsInSubtree(root, node) {
		if (!root || !node) {
			return false;
		}
		if (root === node) {
			return true;
		}
		return typeof root.contains === "function" ? root.contains(node) : true;
	}

	static AreEffectTargetsValid(resolved, effects, root = null, context = null) {
		if (!Array.isArray(resolved) || resolved.length !== effects.length) {
			return false;
		}
		for (let i = 0; i < resolved.length; i++) {
			const entry = resolved[i];
			if (!entry || entry[1] !== effects[i][1]) {
				return false;
			}
			const target = entry[0];
			if (!VNode.IsValidEffectTarget(target)) {
				return false;
			}
			if (root) {
				if (root.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
					continue;
				}
				const anchor =
					target.nodeType === Node.ATTRIBUTE_NODE
						? (target.ownerElement ?? context?.[effects[i][1].id + Slot.Node])
						: target;
				if (!anchor) {
					return false;
				}
				if (!VNode.IsInSubtree(root, anchor)) {
					return false;
				}
			}
		}
		return true;
	}

	static CollectFragmentEffectTargets(fragment, parentNode, start, res) {
		// Fragments do not own a DOM node, so target resolution must flatten them
		// directly against their parent childNodes range.
		let offset = 0;
		for (let i = 0; i < fragment.children.length; i++) {
			const child = fragment.children[i];
			if (child instanceof Effect || isRenderable(child)) {
				const target = parentNode.childNodes[start + offset];
				if (!target) {
					return null;
				}
				res.push([target, child]);
				offset += 1;
			} else if (child instanceof VNode) {
				if (child.name === "#fragment") {
					const consumed = VNode.CollectFragmentEffectTargets(
						child,
						parentNode,
						start + offset,
						res,
					);
					if (consumed === null) {
						return null;
					}
					offset += consumed;
				} else {
					const target = parentNode.childNodes[start + offset];
					if (!target) {
						return null;
					}
					if (!VNode.CollectEffectTargets(child, target, res)) {
						return null;
					}
					offset += 1;
				}
			} else {
				offset += VNode.EmittedNodeCount(child);
			}
		}
		return offset;
	}

	static CollectEffectTargets(vnode, domNode, res = []) {
		// Collects [targetNodeOrAttribute, effect] in deterministic VNode order.
		// This order must match `this.effects` for cache validation and rerender.
		for (const [[ns, name], value] of vnode.attributes.entries()) {
			if (!(value instanceof Effect)) {
				continue;
			}
			const target = ns
				? domNode.getAttributeNodeNS?.(ns, name)
				: domNode.getAttributeNode?.(name);
			if (!target) {
				return null;
			}
			res.push([target, value]);
		}

		let offset = 0;
		for (let i = 0; i < vnode.children.length; i++) {
			const child = vnode.children[i];
			if (child instanceof Effect || isRenderable(child)) {
				const target = domNode.childNodes[offset];
				if (!target) {
					return null;
				}
				res.push([target, child]);
				offset += 1;
			} else if (child instanceof VNode) {
				if (child.name === "#fragment") {
					const consumed = VNode.CollectFragmentEffectTargets(
						child,
						domNode,
						offset,
						res,
					);
					if (consumed === null) {
						return null;
					}
					offset += consumed;
				} else {
					const target = domNode.childNodes[offset];
					if (!target) {
						return null;
					}
					if (!VNode.CollectEffectTargets(child, target, res)) {
						return null;
					}
					offset += 1;
				}
			} else {
				offset += VNode.EmittedNodeCount(child);
			}
		}

		return res;
	}

	static CleanupResolvedEffects(resolved, context, effector) {
		if (!Array.isArray(resolved)) {
			return;
		}
		for (let i = 0; i < resolved.length; i++) {
			const effect = resolved[i]?.[1];
			if (effect?.unrender) {
				effect.unrender(context, effector);
			}
		}
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
			applyAttributeValue(node, ns, name, value);
		}
		for (const child of this.children) {
			if (child instanceof Effect || isRenderable(child)) {
				node.appendChild(
					child.placeholderNodeType === Node.TEXT_NODE
						? document.createTextNode("")
						: document.createComment(""),
				);
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
		const effects = this.effects;
		const n = effects.length;
		const _isFragment = this.name === "#fragment";
		const renderEffects = (resolved) => {
			// Second phase: run effects only after all targets are resolved.
			for (let i = 0; i < n; i++) {
				resolved[i][1].render(resolved[i][0], position, context, effector);
			}
		};
		const resolveEffects = (node) => {
			if (n === 0) {
				return [];
			}
			// First phase: target discovery (no effect execution).
			const resolved = VNode.CollectEffectTargets(this, node, []);
			return VNode.AreEffectTargetsValid(resolved, effects, node, context)
				? resolved
				: null;
		};
		if (!existing) {
			const node = this.clone();
			if (n > 0) {
				const resolved = resolveEffects(node);
				if (!resolved) {
					if (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
						node._uiFragmentChildren = Array.from(node.childNodes);
						node._uiFragmentMounted = true;
					}
					context[id + Slot.Node] = node;
					return effector.appendChild(parent, node, position);
				}
				renderEffects(resolved);
				node._uiEffects = resolved;
			}
			if (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
				node._uiFragmentChildren = Array.from(node.childNodes);
				node._uiFragmentMounted = true;
			}
			context[id + Slot.Node] = node;
			return effector.appendChild(parent, node, position);
		} else {
			const previousResolved = existing._uiEffects;
			let resolved = previousResolved;
			if (!VNode.AreEffectTargetsValid(resolved, effects, existing, context)) {
				// Cached targets are stale (eg: external DOM edits). Try re-resolve on
				// the current node first, then replace with a fresh clone if needed.
				resolved = resolveEffects(existing);
				const hasNewResolution =
					Array.isArray(resolved) && resolved !== previousResolved;
				if (hasNewResolution) {
					VNode.CleanupResolvedEffects(previousResolved, context, effector);
				}
				if (!resolved) {
					const replacement = this.clone();
					const replacementResolved = resolveEffects(replacement);
					if (!replacementResolved) {
						if (!existing.parentNode) {
							if (
								existing.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
								existing._uiFragmentChildren
							) {
								for (const child of existing._uiFragmentChildren) {
									if (!child.parentNode) existing.appendChild(child);
								}
							}
							effector.appendChild(parent, existing, position);
						}
						return existing;
					}
					if (!hasNewResolution) {
						VNode.CleanupResolvedEffects(previousResolved, context, effector);
					}
					renderEffects(replacementResolved);
					replacement._uiEffects = replacementResolved;
					context[id + Slot.Node] = replacement;
					if (replacement.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
						replacement._uiFragmentChildren = Array.from(
							replacement.childNodes,
						);
					}
					if (existing.parentNode) {
						existing.parentNode.replaceChild(replacement, existing);
					} else {
						effector.appendChild(parent, replacement, position);
					}
					return replacement;
				}
				existing._uiEffects = resolved;
			}
			renderEffects(resolved);
			if (!existing.parentNode) {
				if (existing.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
					if (!existing._uiFragmentMounted) {
						if (existing._uiFragmentChildren) {
							for (const child of existing._uiFragmentChildren) {
								existing.appendChild(child);
							}
						}
						effector.appendChild(parent, existing, position);
						existing._uiFragmentMounted = true;
					}
				} else {
					effector.appendChild(parent, existing, position);
				}
			}
			return existing;
		}
	}

	unrender(context, effector, id) {
		const existing = context[id + Slot.Node];
		if (existing) {
			if (existing.parentNode) {
				existing.parentNode.removeChild(existing);
			} else if (existing._uiFragmentChildren) {
				// DocumentFragment nodes never have a parentNode after their
				// children are transferred to the DOM. Remove the tracked
				// children instead.
				for (const child of existing._uiFragmentChildren) {
					if (child.parentNode) {
						child.parentNode.removeChild(child);
					}
				}
				existing._uiFragmentMounted = false;
			}
		}
		for (const [_, effect] of this.effects) {
			effect.unrender(context, effector);
		}
	}
}

// EOF
