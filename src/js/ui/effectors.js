// --
// A simple effector for the DOM, inserts nodes and attributes at given position relative
// to a parent, supporting document fragments.
export class DOMEffector {
	static PlaceholderTextOwner = Symbol("ui.placeholderTextOwner");

	ensureContent(parent, position, content) {
		const t = typeof content;
		if (content === null || content === undefined) {
			// pass
		} else if (t === "string") {
			return this.ensureText(parent, position, content);
		} else if (t === "number") {
			return this.ensureText(parent, position, `${content}`);
		} else {
			console.error("Unsupported content", { content });
		}
	}

	// TODO: Implement position support
	ensureText(parent, position, text) {
		const value = `${text}`;
		if (!parent) {
			return document.createTextNode(value);
		}
		if (parent.nodeType === Node.TEXT_NODE) {
			parent.data = value;
			return parent;
		}
		if (parent.nodeType === Node.ATTRIBUTE_NODE) {
			parent.value = value;
			return parent;
		}
		if (parent.nodeType === Node.COMMENT_NODE) {
			const previous = parent.previousSibling;
			if (
				previous?.nodeType === Node.TEXT_NODE &&
				previous[DOMEffector.PlaceholderTextOwner] === parent
			) {
				previous.data = value;
				return previous;
			}
			const child = document.createTextNode(value);
			child[DOMEffector.PlaceholderTextOwner] = parent;
			parent.parentNode?.insertBefore(child, parent);
			return child;
		}
		if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
			const child = document.createTextNode(value);
			return this.appendChild(parent, child, position);
		}
		const index = Array.isArray(position)
			? (position.at(-1) ?? 0)
			: typeof position === "number"
				? position
				: 0;
		const existing = parent.childNodes[index];
		if (existing?.nodeType === Node.TEXT_NODE) {
			existing.data = value;
			return existing;
		}
		const child = document.createTextNode(value);
		if (existing) {
			parent.insertBefore(child, existing);
		} else {
			parent.appendChild(child);
		}
		return child;
	}

	ensureAttribute(node, ns, name, value) {
		if (ns) {
			node.setAttributeNS(ns, name, `${value}`);
		} else {
			node.setAttribute(name, `${value}`);
		}
	}

	// TODO: Implement position support
	ensureNode(parent, _position, ns, name) {
		const node = ns
			? document.createElementNS(ns, name)
			: document.createElement(name);
		return this.appendChild(parent, node);
	}

	ensurePosition(parent, position = 0) {
		if (parent.childNodes.length > position) {
			return parent.childNodes[position];
		}
		while (parent.childNodes.length <= position) {
			parent.appendChild(document.createComment(""));
		}
		return parent.childNodes[position];
	}

	// TODO: Implement position support
	appendChild(parent, child, position = 0) {
		// TODO: Support fragments
		if (!parent) {
			return child;
		}
		// if (parent.nodeType !== Node.COMMENT_NODE) {
		// 	while (parent.childNodes.length < position) {
		// 		parent.appendChild(
		// 			document.createComment(`P${parent.childNodes.length}`)
		// 		);
		// 	}
		// }

		// There is a special case where the component is created with a fragment
		// as a parent. This is typically for a root component, and as the document fragment
		// is emptied after the first pass (for performance), we need on
		// subsequent passes to append the child where the fragment was mounted.
		const index = Array.isArray(position)
			? (position.at(-1) ?? 0)
			: typeof position === "number"
				? position
				: 0;

		if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
			if (parent.uiParentElement !== undefined) {
				return this.appendChild(
					parent.uiParentElement,
					child,
					parent.uiParentPosition + index,
				);
			} else {
				if (child.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
					for (const c of child.childNodes) {
						parent.appendChild(c);
					}
				} else {
					parent.appendChild(child);
				}
			}
		} else if (parent.nodeType === Node.COMMENT_NODE) {
			if (!parent.parentNode) {
				console.error("Parent comment node has no parent", {
					parent,
					child,
				});
				return child;
			} else {
				parent.parentNode.insertBefore(child, parent);
			}
		} else {
			if (parent.childNodes[index] === child) {
				// Already in position, nothing to do
			} else if (parent.childNodes.length > index) {
				parent.insertBefore(child, parent.childNodes[index]);
			} else {
				parent.appendChild(child);
			}
		}
		return child;
	}

	unmount(node) {
		if (node) {
			if (node.nodeType === Node.ATTRIBUTE_NODE && node.ownerElement) {
				node.ownerElement.removeAttributeNode(node);
			} else if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
		return node;
	}
}
// EOF
