import { list } from "./utils/collections.js";

export const bind = (node, handlers) =>
	(handlers &&
		Object.entries(handlers).forEach(([k, v]) =>
			list(node).forEach((_) => _.addEventListener(k, v))
		)) ||
	node;

export const unbind = (node, handlers) =>
	(handlers &&
		Object.entries(handlers).forEach(([k, v]) =>
			list(node).forEach((_) => _.removeEventListener(k, v))
		)) ||
	node;

export const drag = (event, move, end) => {
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		pointerEvents: event.target.style.pointerEvents,
		userSelect: event.target.style.userSelect,
	};
	const handlers = {
		mousemove: (event) => {
			move &&
				move(event, {
					dx: event.pageX - dragging.ox,
					dy: event.pageY - dragging.oy,
				});
		},
		mouseup: (event) => {
			dragging.node.style.pointerEvents = dragging.pointerEvents;
			dragging.node.style.userSelect = dragging.userSelect;
			unbind(window.document.body, handlers);
			end && end(event);
		},
	};
	// event.target.style.pointerEvents = "none";
	event.target.style.userSelect = "none";
	bind(window.document.body, handlers);
	return () => unbind(window.document.body, handlers);
};

export const autoresize = (event) => {
	const node = event.target;
	node.style.height = "auto"; // First set height to auto to measure content
	const style = window.getComputedStyle(node);
	const border =
		parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	// That's if the box-sizing is border-box.
	node.style.height = border + node.scrollHeight + "px"; // Adjust hei
};

// EOF
