import { describe, expect, test } from "bun:test";
import { $ } from "../src/js/ui/hyperscript.js";
import { Context } from "../src/js/ui/cells.js";

describe("core signal", () => {
	test("$.signal creates a context-bound cell", () => {
		const count = $.signal(0);

		expect(count.get()).toBe(0);
		count.set(3);
		expect(count.get()).toBe(3);
	});

	test("$.signal supports explicit context override", () => {
		const contextA = [];
		const contextB = [];
		const value = $.signal(1, contextA);

		value.set(2);
		value.set(9, true, contextB);

		expect(value.get()).toBe(2);
		expect(value.get(contextB)).toBe(9);
	});

	test("$.signal interoperates with derived cells", () => {
		const a = $.signal(2);
		const doubled = $.cell({ a }, ({ a }) => a * 2);

		doubled.applyContext(a.context);

		expect(Context.Run(a.context, () => doubled.get())).toBe(4);
		a.set(5);
		expect(Context.Run(a.context, () => doubled.get())).toBe(10);
	});
});
