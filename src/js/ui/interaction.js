import { list } from "./utils/collections.js";
import { def } from "./utils/func.js";

// NOTE: Should probably be split up in submodules

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
		step: 0,
	};
	const handlers = {
		mousemove: (event) => {
			move &&
				move(event, {
					dx: event.pageX - dragging.ox,
					dy: event.pageY - dragging.oy,
					step: dragging.step++,
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

// Translated from FF-Kit's Stdlibs
export class Keyboard {
	static Down = "keydown";
	static Up = "keyup";
	static Press = "press";

	static Codes = {
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
		PAGEUP: 33,
		PAGEDOWN: 34,
		HOME: 36,
		END: 35,
		SHIFT: 16,
		ALT: 18,
		CTRL: 17,
		META_L: 91,
		META_R: 92,
	};

	// --
	// Returns the name of the key pressed. This takes into account
	// keyboard layout and modifiers.
	static Key(event) {
		return event ? def(event.key, event.keyIdentifier, null) : null;
	}

	// --
	// Returns the code of the key. This does not take into account
	// keyboard layout, it just returns the number of the key.
	static Code(event) {
		// SEE: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
		//SEE: http://caniuse.com/#feat=keyboardevent-code
		return event ? def(event.keyCode, null) : null;
	}

	// --
	// Returns the character that would be typed by the event. This relies
	// on `Key` to work.
	//
	// Note that the often recommended `String.fromCharCode(event.keyCode)`
	// does not work as you would expect. The problem is that you can't use `keyCode` because it can
	// translate into different characters based on modifiers and
	// keyboard layout. For instance pressing 8 gives keyCode=56,
	// but pressing shift+8 gives also keyCode=56, while the
	// key is "*" on FR_CA keyboard.
	static Char(event) {
		const k = Keyboard.Key(event);
		return !k ? null : k.length === 1 ? k : k === "Enter" ? "\n" : null;
	}

	static IsControl(event) {
		const k = Keyboard.key(event);
		return k && k.length > 1;
	}

	static HasModifier(event) {
		return event && (event.altKey || event.ctrlKey);
	}
}

// EOF
