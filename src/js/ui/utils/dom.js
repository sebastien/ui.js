import Options from "./options.js";

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
export const contentAsFragment = (node) => {
	const fragment = document.createDocumentFragment();
	while (fragment && node.firstChild) {
		fragment.appendChild(node.firstChild);
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

// --
// A collection of utilities to better work with the DOM
export class DOM {
	static after(previous, node) {
		switch (previous.nextSibling) {
			case null:
			case undefined:
				previous.parentNode && previous.parentNode.appendChild(node);
				return;
			case node:
				return;
			default:
				previous.parentNode &&
					previous.parentNode.insertBefore(
						node,
						previous.nextSibling
					);
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
}

// SEE: https://developer.mozilla.org/en-US/docs/Web/Events
export const WebEvents = [
	"abort",
	"animation-cancel",
	"animation-end",
	"animation-iteration",
	"animation-start",
	"before-load",
	"before-print",
	"before-unload",
	"blur",
	"change",
	"clipboard-paste",
	"clipboard-polyfill",
	"composition-end",
	"composition-start",
	"composition-update",
	"contextmenu",
	"copy",
	"cut",
	"dblclick",
	"drag",
	"dragend",
	"dragover",
	"dragleave",
	"dragstart",
	"drop",
	"error",
	"focus",
	"focusin",
	"focusout",
	"form-data",
	"fullscreen-change",
	"fullscreen-error",
	"gotpointercapture",
	"hashchange",
	"input",
	"invalid",
	"keydown",
	"keypress",
	"keyup",
	"languagechange",
	"load",
	"loadend",
	"loadstart",
	"lostpointercapture",
	"mousedown",
	"mousemove",
	"mouseout",
	"mouseover",
	"mouseup",
	"paste",
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
	"select",
	"selectionchange",
	"submit",
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
	"wheel",
	"click",
	"canplay",
	"canplaythrough",
	"cuechange",
	"durationchange",
	"ended",
	"emptied",
	"loadeddata",
	"loadedmetadata",
	"pause",
	"play",
	"playing",
	"seeked",
	"seeking",
	"stalled",
	"suspend",
	"timeupdate",
	"volumechange",
	"waiting",
	"blob-loaded",
	"close",
	"message",
	"open",
	"storage",
	"send",
	"deviceorientation",
	"deviceorientationabsolute",
	"devicemotion",
	"gyroscope",
	"magnetometer",
	"chargingchange",
	"dischargingchange",
	"levelchange",
	"online",
	"offline",
	"audioend",
	"audiostart",
	"end",
	"speechend",
	"speechstart",
].reduce((r, v) => ((r[v] = true), r), {});

// EOF
