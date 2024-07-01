// --
// A simple effector for the DOM, inserts nodes and attributes at given position relative
// to a parent, supporting document fragments.
export class DOMEffector {
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
		const child = document.createTextNode(`${text}`);
		return this.appendChild(parent, child);
	}

	ensureAttribute(node, ns, name, value) {
		if (ns) {
			node.setAttributeNS(ns, name, `${value}`);
		} else {
			node.setAttribute(name, `${value}`);
		}
	}

	// TODO: Implement position support
	ensureNode(parent, position, ns, name) {
		const node = ns
			? document.createElementNS(ns, name)
			: document.createElement(name);
		return this.appendChild(parent, node);
	}

	// TODO: Implement position support
	appendChild(parent, child, position = 0) {
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
		if (
			parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
			parent.uiParentElement !== undefined
		) {
			return this.appendChild(
				parent.uiParentElement,
				child,
				parent.uiParentPosition + position
			);
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
			// FIXME: THat doesn't work
			// } else if (parent.childNodes[position] !== child) {
			// 	// Nothing to do, the node is here
			// } else if (parent.childNodes.length > position) {
			// 	parent.insertBefore(child, parent.childNodes[position]);
		} else {
			parent.appendChild(child);
		}
		return child;
	}

	unmount(node) {
		if (parent.nodeType === Node.ATTRIBUTE_NODE) {
			node.ownerElement.removeAttributeNode(node);
		} else {
			node.parentNode.removeChild(node);
		}
		return node;
	}
}
// EOF
