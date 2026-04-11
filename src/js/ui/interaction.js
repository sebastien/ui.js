// Project: ui.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: features/interaction
// DOM interaction utilities for event handling, drag operations, keyboard input,
// and auto-resizing elements. Provides a lightweight alternative to full event
// delegation systems.
//
// Example:
// ```javascript
// // Bind multiple events
// bind(button, {
//   click: (e) => console.log("clicked"),
//   mouseenter: (e) => button.classList.add("hover")
// });
//
// // Drag operation
// drag(mouseEvent,
//   (e, delta) => moveElement(delta.dx, delta.dy),
//   (e, delta) => console.log("drag ended")
// );
// ```

// ----------------------------------------------------------------------------
//
// EVENT BINDING
//
// ----------------------------------------------------------------------------

/**
 * Attaches event listeners from `handlers` to `node` (or nodes).
 * Returns the node(s) for chaining.
 *
 * @param {EventTarget|EventTarget[]} node - The target node(s) to bind events to
 * @param {Record<string, (event: Event) => void>} handlers - Event handlers to attach
 * @returns {EventTarget|EventTarget[]} The node(s) for chaining
 */
function bind(node, handlers) {
	if (handlers) {
		for (const [k, v] of Object.entries(handlers)) {
			for (const _ of Array.isArray(node) ? node : [node]) {
				_.addEventListener(k, v);
			}
		}
	}
	return node;
}

/**
 * Removes event listeners from `handlers` from `node` (or nodes).
 * Returns the node(s) for chaining.
 *
 * @param {EventTarget|EventTarget[]} node - The target node(s) to unbind events from
 * @param {Record<string, (event: Event) => void>} handlers - Event handlers to remove
 * @returns {EventTarget|EventTarget[]} The node(s) for chaining
 */
function unbind(node, handlers) {
	if (handlers) {
		for (const [k, v] of Object.entries(handlers)) {
			for (const _ of Array.isArray(node) ? node : [node]) {
				_.removeEventListener(k, v);
			}
		}
	}
	return node;
}

// ----------------------------------------------------------------------------
//
// DRAGGING
//
// ----------------------------------------------------------------------------

/**
 * Initiates a drag operation from a mouse event. Tracks mouse movement
 * and invokes callbacks during the drag lifecycle.
 *
 * @param {MouseEvent} event - The mouse event that starts the drag
 * @param {(event: MouseEvent, delta: DragData) => undefined|false|null} [move] - Callback during drag movement
 * @param {(event: MouseEvent, delta: DragData) => undefined|false|null} [end] - Callback when drag ends
 * @returns {() => void} Function to cancel the drag operation
 */
function drag(event, move, end) {
	const context = {};
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		pointerEvents: event.target.style.pointerEvents,
		userSelect: event.target.style.userSelect,
		context,
		step: 0,
		dx: 0,
		dy: 0,
	};
	const data = Object.create(dragging);
	// TODO: Should support touch
	// TODO: Should support exit and re-enter from window
	const scope = globalThis.window;
	const on_end = (event) => {
		const mouseEvent = event;
		dragging.node.style.pointerEvents = dragging.pointerEvents;
		dragging.node.style.userSelect = dragging.userSelect;
		unbind(scope, handlers);
		data.dx = mouseEvent.pageX - dragging.ox;
		data.dy = mouseEvent.pageY - dragging.oy;
		data.isLast = true;
		end?.(mouseEvent, data);
	};
	const handlers = {
		mousemove: (event) => {
			const mouseEvent = event;
			data.dx = mouseEvent.pageX - dragging.ox;
			data.dy = mouseEvent.pageY - dragging.oy;
			data.isFirst = dragging.step === 0;
			dragging.step += 1;
			const v = move?.(mouseEvent, data);
			switch (v) {
				case null:
					event.preventDefault();
					event.stopPropagation();
					break;
				case false:
					do_end();
			}
		},
		mouseup: on_end,
		mouseleave: on_end,
	};
	event.target.style.userSelect = "none";
	const do_end = () => unbind(scope, handlers);
	bind(scope, handlers);
	return do_end;
}

// ----------------------------------------------------------------------------
//
// DOM TRAVERSAL
//
// ----------------------------------------------------------------------------

/**
 * Traverses up from `node` looking for a node that satisfies `predicate`.
 * Returns the matching node or undefined if not found.
 *
 * @param {Node} node - The starting node
 * @param {(node: Node) => boolean} predicate - Function to test each node
 * @returns {Node|undefined} The matching node or undefined
 */
function target(node, predicate) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		if (predicate(node)) {
			return node;
		} else {
			node = node.parentNode;
		}
	}
	return undefined;
}

/**
 * Finds nearest element with data-drag attribute matching `name`.
 * If no name provided, matches any data-drag attribute.
 * Returns element or undefined if not found.
 *
 * @param {Node} node - The starting node
 * @param {string} [name] - The data-drag attribute value to match
 * @returns {Node|undefined} The matching element or undefined
 */
function dragtarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const e = node;
		if (!name && e.hasAttribute("data-drag")) {
			return e;
		} else if (name && e.getAttribute("data-drag") === name) {
			return e;
		}
		node = e.parentNode;
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined;
}
drag.target = dragtarget;

// ----------------------------------------------------------------------------
//
// AUTO-RESIZE
//
// ----------------------------------------------------------------------------

/**
 * Automatically resizes a textarea to fit its content height.
 * Call on input events: textarea.addEventListener("input", autoresize)
 *
 * @param {Event} event - The input event
 */
function autoresize(event) {
	const node = event.target;
	node.style.height = "auto"; // First set height to auto to measure content
	const style = globalThis.window.getComputedStyle(node);
	const border =
		parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	// That's if the box-sizing is border-box.
	node.style.height = `${border + node.scrollHeight}px`; // Adjust height
}

// ----------------------------------------------------------------------------
//
// KEYBOARD
//
// ----------------------------------------------------------------------------

/**
 * Keyboard event utilities and key code constants.
 */
const Keyboard = {
	// Event type constants
	Down: "keydown",
	Up: "keyup",
	Press: "press",

	// Key code constants
	Codes: {
		SPACE: 32,
		TAB: 9,
		ENTER: 13,
		COMMA: 188,
		COLON: 186,
		BACKSPACE: 8,
		INSERT: 45,
		DELETE: 46,
		ESC: 27,
		UP: 38,
		DOWN: 40,
		LEFT: 37,
		RIGHT: 39,
		PAGE_UP: 33,
		PAGE_DOWN: 34,
		HOME: 36,
		END: 35,
		SHIFT: 16,
		ALT: 18,
		CTRL: 17,
		META_L: 91,
		META_R: 92,
	},

	/**
	 * Returns the name of the key pressed. Takes into account keyboard
	 * layout and modifiers.
	 *
	 * @param {KeyboardEvent} event - The keyboard event
	 * @returns {string|null} The key name or null
	 */
	Key(event) {
		return event ? (event.key ?? event.keyIdentifier ?? null) : null;
	},

	/**
	 * Returns the code of the key. Does not take into account keyboard
	 * layout, just returns the key number.
	 *
	 * @param {KeyboardEvent} event - The keyboard event
	 * @returns {number|null} The key code or null
	 */
	Code(event) {
		// SEE: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
		//SEE: http://caniuse.com/#feat=keyboardevent-code
		return event ? (event.keyCode ?? null) : null;
	},

	/**
	 * Returns the character that would be typed by the event.
	 * Note: String.fromCharCode(event.keyCode) does not work as expected
	 * because keyCode can translate to different characters based on
	 * modifiers and keyboard layout.
	 *
	 * @param {KeyboardEvent} event - The keyboard event
	 * @returns {string|null} The character or null
	 */
	Char(event) {
		const k = Keyboard.Key(event);
		return !k ? null : k.length === 1 ? k : k === "Enter" ? "\n" : null;
	},

	/**
	 * Returns true if the key is a control key (not a character).
	 *
	 * @param {KeyboardEvent} event - The keyboard event
	 * @returns {boolean} True if the key is a control key
	 */
	IsControl(event) {
		const k = Keyboard.Key(event);
		return !!(k && k.length > 1);
	},

	/**
	 * Returns true if Alt or Ctrl is pressed.
	 *
	 * @param {KeyboardEvent} event - The keyboard event
	 * @returns {boolean} True if Alt or Ctrl is pressed
	 */
	HasModifier(event) {
		return !!(event && (event.altKey || event.ctrlKey));
	},
};

export { autoresize, bind, drag, dragtarget, Keyboard, target, unbind };

// EOF
