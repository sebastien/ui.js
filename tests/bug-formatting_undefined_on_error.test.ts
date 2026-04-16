import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { FormattingEffect } from "../src/js/ui/effects.js";
import { Signal } from "../src/js/ui/templates.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

// Bug #10: FormattingEffect._format returns undefined when the
// formatter throws. The caller does textNode.data = output, which
// in browsers coerces undefined to the string "undefined".
//
// Note: The domish test DOM does not coerce .data assignments to
// strings like real browsers do, so we test _format's return value
// directly to confirm the bug.
describe("bug formatting undefined on error", () => {
	beforeEach(() => {
		installDom();
	});

	test("_format returns a safe fallback when formatter throws", () => {
		const throwingFormatter = () => {
			throw new Error("formatter exploded");
		};

		const signal = new Signal("test");
		const effect = new FormattingEffect(signal, throwingFormatter);

		// _format should handle the error and return a safe fallback.
		const result = effect._format("some input", null);
		expect(result).toBe("");
	});

	test("_format returns string for valid input", () => {
		const goodFormatter = (v) => `ok:${v}`;
		const signal = new Signal("test");
		const effect = new FormattingEffect(signal, goodFormatter);

		const result = effect._format("hello", null);
		expect(result).toBe("ok:hello");
	});

	test("_format without formatter coerces to string", () => {
		const signal = new Signal("test");
		const effect = new FormattingEffect(signal, null);

		expect(effect._format(42, null)).toBe("42");
		expect(effect._format("hello", null)).toBe("hello");
		expect(effect._format(null, null)).toBe("null");
	});

	test("throwing formatter does not corrupt subsequent renders", () => {
		const value = $.signal("hello");

		let shouldThrow = false;
		const conditionalFormatter = (v) => {
			if (shouldThrow) {
				throw new Error("format error");
			}
			return `ok:${v}`;
		};

		const App = () => h.span(value.text(conditionalFormatter));
		const { parent, derivedContext } = mountWithHandle(App, {});

		// Initial render succeeds
		expect(parent.textContent).toContain("ok:hello");

		// Error render
		shouldThrow = true;
		value.set("bad", true, derivedContext);

		// After error, the DOM should retain the previous good value
		// or show empty -- not the literal string "undefined"
		const text = parent.textContent;
		// In domish, undefined stays as undefined (not coerced).
		// In a real browser, textNode.data = undefined becomes "undefined".
		// Either way, the _format method should return a string, not undefined.
		expect(text).not.toContain("undefined");
	});
});
