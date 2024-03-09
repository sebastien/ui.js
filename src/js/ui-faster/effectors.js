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

	ensureNode(parent, position, ns, name) {
		const node = ns
			? document.createElementNS(ns, name)
			: document.createElement(name);
		return this.appendChild(parent, node);
	}

	appendChild(parent, child) {
		if (!parent) {
			return child;
		}
		if (parent.nodeType === Node.COMMENT_NODE) {
			parent.parentNode.insertBefore(child, parent);
		} else {
			parent.appendChild(child);
		}
		return child;
	}
}
// EOF
