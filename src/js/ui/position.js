import { onError, Enum } from "./utils.js";

// --
// # Position & Dimension
//
// A collection of useful functions for working with the positionning of
// elements/values.

export const Types = Enum("Window", "Document", "Node", "Array");
export const typeOf = (value) => {};

export const position = (value) => {
	if (value === globalThis.window) {
		return [value.pageXOffset, value.pageYOffset];
	} else if (value instanceof Array) {
		return value;
	} else if (value instanceof Event) {
		return [value.pageX, value.pageY];
	} else if (value instanceof Node) {
		const rect = value.getBoundingClientRect();
		return [rect.left + window.pageXOffset, rect.top + window.pageYOffset];
	} else {
		onError(`ui.position: value type not supported`, { value });
		return null;
	}
};

export const dimension = (value) => {
	if (value === globalThis.document) {
		return [
			document.documentElement.scrollWidth,
			document.documentElement.scrollHeight,
		];
	} else if (value === globalThis.window) {
		return [window.innerWidth, window.innerHeight];
	} else if (value instanceof Array) {
		return value;
	} else if (value instanceof Event) {
		return [0, 0];
	} else if (value instanceof Node) {
		const rect = value.getBoundingClientRect();
		return [rect.width, rect.height];
	} else {
		onError(`ui.position: value type not supported`, { value });
		return null;
	}
};

export const area = (value) => position(value).concat(dimension(value));

export const place = (node, area) => {
	node.style.left = `${area[0]}px`;
	node.style.top = `${area[1]}px`;
	if (area.length > 2) {
		node.style.width = `${area[2]}px`;
		node.style.height = `${area[3]}px`;
	}
	return node;
};

export const reldimension = (context, value) => {
	const a = dimension(context);
	const b = dimension(value);
	if (a && b) {
		return [b[0] / a[0], b[1] / a[1]];
	} else {
		return null;
	}
};

export const relposition = (context, value) => {
	const a = position(context);
	const b = position(value);
	if (a && b) {
		return [b[0] - a[0], b[1] - a[1]];
	} else {
		return null;
	}
};

// EOF
