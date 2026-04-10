import Options from "./options.js";
import { isObject } from "./values.js";

export const createComment = (text) =>
	Options.anchors
		? document.createComment(Options.anchors === "short" ? "" : text)
		: document.createTextNode("");

export const asFragment = (...nodes) => {
	const fragment = document.createDocumentFragment();
	for (const node of nodes) {
		fragment.appendChild(node);
	}
	return fragment;
};

// Flushes the content of the node into a new fragment
export const contentAsFragment = (node, ignored) => {
	const fragment = document.createDocumentFragment();
	while (fragment && node.firstChild) {
		if (node.firstChild !== ignored) {
			fragment.appendChild(node.firstChild);
		}
	}
	return fragment;
};

// -- doc
// Creates an anchor node with the given `name` for the given `node`. If the
// node is a slot, the anchor will replace the slot, otherwise the anchor
// will be added as a child.
export const createAnchor = (node, name) => {
	const anchor = createComment(name);
	if (node.nodeName === "slot" || node.nodeName === "SLOT") {
		node.parentElement.replaceChild(anchor, node);
	} else {
		node.appendChild(anchor);
	}
	return anchor;
};

export const replaceNodeWithPlaceholder = (node, placeholder) => {
	const anchor = createComment(placeholder);
	node.parentElement && node.parentElement.replaceChild(anchor, node);
	return anchor;
};
// -- doc
// Tells if the node is empty, stripping text nodes that only have whitespace.
export const isNodeEmpty = (node) => {
	const n = node.childNodes.length;
	for (let i = 0; i < n; i++) {
		const child = node.childNodes[i];
		switch (child.nodeType) {
			case Node.TEXT_NODE:
				if (!/^\s*$/.test(child.data)) {
					return false;
				}
				break;
			case Node.ELEMENT_NODE:
				return false;
		}
	}
	return true;
};

export const NS = {
	svg: "http://www.w3.org/2000/svg",
	xlink: "http://www.w3.org/1999/xlink",
};

class DOMProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		const node = this.namespace
			? document.createElementNS(this.namespace, property)
			: document.createElement(property);
		return (...args) => {
			for (const v of args) {
				if (isObject(v)) {
					for (const k in args) {
						const w = v[k];
						DOM.attr(
							node,
							k,
							w === null || w === undefined ? "" : `${w}`
						);
					}
				} else if (v instanceof Node) {
					node.appendChild(v);
				} else if (v === null || v === undefined) {
					// pass
				} else {
					node.appendChild(document.createTextNode(`${v}`));
				}
			}
		};
	}
}

// --
// A collection of utilities to better work with the DOM
export class DOM {
	static attr(node, name, value, append = 0, ns = undefined) {
		const t = typeof value;
		if (!ns && name.startsWith("on")) {
			const n = name.toLowerCase();
			if (node[n] !== undefined) {
				// We have a callback
				node[n] = value;
			}
			return node;
		}
		if (!ns & (name === "style") && t === "object") {
			// We manage style properties by valle
			if (!append) {
				node.setAttribute("style", "");
			}
			Object.assign(node.style, value);
		} else if (!ns && name === "value" && node.value !== undefined) {
			node.value = value ? value : "";
		} else if (!ns && name.startsWith("on") && node[name] !== undefined) {
			// We have a callback
			node[name] = value;
		} else if (value === undefined || value === null) {
			// We remove the attribute
			ns ? node.removeAttributeNS(ns, name) : node.removeAttribute(name);
		} else {
			// We have a regular value that we stringify
			const v =
				t === "number"
					? `${value}`
					: t === "string"
					? value
					: JSON.stringify(value);
			// If we append, we create an inermediate value.
			if (append) {
				const e = ns
					? node.getAttributeNS(ns, name)
					: node.getAttribute(name);
				const w = `${append < 0 && e ? e + " " : ""}${v}${
					append > 0 && e ? " " + e : ""
				}`;
				ns
					? node.setAttributeNS(ns, name, w)
					: node.setAttribute(name, w);
			} else {
				ns
					? node.setAttributeNS(ns, name, v)
					: node.setAttribute(name, v);
			}
		}
		return node;
	}
	static before(next, node) {
		next.parentNode && next.parentNode.insertBefore(node, next);
		return node;
	}
	static after(previous, node) {
		switch (previous.nextSibling) {
			case null:
			case undefined:
				previous.parentNode && previous.parentNode.appendChild(node);
				return node;
			case node:
				return node;
			default:
				previous.parentNode &&
					previous.parentNode.insertBefore(
						node,
						previous.nextSibling
					);
				return node;
		}
	}
	static mount(parent, node) {
		switch (parent.nodeType) {
			case Node.ELEMENT_NODE:
				if (node instanceof Array) {
					let n = node[0];
					n.parentNode !== parent && parent.appendChild(n);
					for (let i = 1; i < node.length; i++) {
						DOM.after(n, node[i]);
						n = node[i];
					}
				} else {
					node.parentNode !== parent && parent.appendChild(node);
				}
				break;
			default:
				// TODO: Should really be DOM.after, but it breaks the effectors test
				DOM.after(parent, node);
		}
	}
	static unmount(node) {
		if (node === null || node === undefined) {
			return node;
		} else if (node instanceof Array) {
			for (const n of node) {
				n.parentNode?.removeChild(n);
			}
		} else {
			node.parentNode?.removeChild(node);
		}
		return node;
	}
	static replace(previous, node) {
		if (node === null || node === undefined) {
			return node;
		} else if (previous instanceof Array) {
			previous[0].parentNode?.insertBefore(node, previous[0]);
			DOM.unmount(previous);
		} else {
			previous.parentNode?.replaceChild(node, previous);
		}
	}
	// If the node has a single element child and only empty text
	// nodes, then it will return the only child.
	static unwrap(node) {
		let element = undefined;
		for (const child of node.childNodes) {
			switch (child.nodeType) {
				case Node.ELEMENT_NODE:
					if (element) {
						return node;
					} else {
						element = child;
					}
					break;
				case Node.TEXT_NODE:
					if (child.data) {
						return node;
					}
			}
		}
		return element || node;
	}
}

// SEE: https://developer.mozilla.org/en-US/docs/Web/Events
export const WebEvents = [
	"abort",
	"animation-cancel",
	"animation-end",
	"animation-iteration",
	"animation-start",
	"audioend",
	"audiostart",
	"before-load",
	"before-print",
	"before-unload",
	"blob-loaded",
	"blur",
	"canplay",
	"canplaythrough",
	"change",
	"chargingchange",
	"click",
	"clipboard-paste",
	"clipboard-polyfill",
	"close",
	"composition-end",
	"composition-start",
	"composition-update",
	"contextmenu",
	"copy",
	"cuechange",
	"cut",
	"dblclick",
	"devicemotion",
	"deviceorientation",
	"deviceorientationabsolute",
	"dischargingchange",
	"drag",
	"dragend",
	"dragleave",
	"dragover",
	"dragstart",
	"drop",
	"durationchange",
	"emptied",
	"end",
	"ended",
	"error",
	"focus",
	"focusin",
	"focusout",
	"form-data",
	"fullscreen-change",
	"fullscreen-error",
	"gotpointercapture",
	"gyroscope",
	"hashchange",
	"input",
	"invalid",
	"keydown",
	"keypress",
	"keyup",
	"languagechange",
	"levelchange",
	"load",
	"loadeddata",
	"loadedmetadata",
	"loadend",
	"loadstart",
	"lostpointercapture",
	"magnetometer",
	"message",
	"mousedown",
	"mousemove",
	"mouseout",
	"mouseover",
	"mouseup",
	"offline",
	"online",
	"open",
	"paste",
	"pause",
	"play",
	"playing",
	"pointercancel",
	"pointerdown",
	"pointerenter",
	"pointerleave",
	"pointermove",
	"pointerout",
	"pointerover",
	"popstate",
	"progress",
	"ratechange",
	"reset",
	"resize",
	"scroll",
	"scrollend",
	"scrollstart",
	"seeked",
	"seeking",
	"select",
	"selectionchange",
	"send",
	"speechend",
	"speechstart",
	"stalled",
	"storage",
	"submit",
	"suspend",
	"timeupdate",
	"touchcancel",
	"touchend",
	"touchmove",
	"touchstart",
	"transitioncancel",
	"transitionend",
	"transitionrun",
	"transitionstart",
	"unload",
	"visibilitychange",
	"volumechange",
	"waiting",
	"wheel",
].reduce((r, v) => ((r[v] = true), r), {});

export const html = new Proxy({}, new DOMProxy());
export const svg = new Proxy({}, new DOMProxy(NS.svg));
// EOF
