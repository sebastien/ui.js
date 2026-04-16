import { describe, expect, test } from "bun:test";
import { Context, Slot } from "../src/js/ui/cells.js";

describe("Slot.Expand", () => {
	test("expands a Slot to its context value", () => {
		const ctx = {};
		const slot = new Slot();
		slot.set(42, true, ctx);

		expect(Slot.Expand(slot, ctx)).toBe(42);
	});

	test("expands a plain object of Slots", () => {
		const ctx = {};
		const a = new Slot();
		const b = new Slot();
		a.set("hello", true, ctx);
		b.set("world", true, ctx);

		const result = Slot.Expand({ a, b }, ctx);
		expect(result).toEqual({ a: "hello", b: "world" });
	});

	test("expands an array of Slots", () => {
		const ctx = {};
		const a = new Slot();
		const b = new Slot();
		a.set(1, true, ctx);
		b.set(2, true, ctx);

		const result = Slot.Expand([a, b], ctx);
		expect(result).toEqual([1, 2]);
	});

	test("expands a Map of Slots", () => {
		const ctx = {};
		const a = new Slot();
		const b = new Slot();
		a.set("alpha", true, ctx);
		b.set("beta", true, ctx);

		const template = new Map([
			["x", a],
			["y", b],
		]);
		const result = Slot.Expand(template, ctx);

		// Result must be a Map, not the original template
		expect(result).toBeInstanceOf(Map);
		expect(result).not.toBe(template);
		// Values must be expanded (context values, not Slot instances)
		expect(result.get("x")).toBe("alpha");
		expect(result.get("y")).toBe("beta");
	});

	test("expands a Map nested inside a plain object", () => {
		const ctx = {};
		const slot = new Slot();
		slot.set(99, true, ctx);

		const template = {
			inner: new Map([["key", slot]]),
		};
		const result = Slot.Expand(template, ctx);

		expect(result.inner).toBeInstanceOf(Map);
		expect(result.inner.get("key")).toBe(99);
	});

	test("passes through primitive values unchanged", () => {
		const ctx = {};
		expect(Slot.Expand("hello", ctx)).toBe("hello");
		expect(Slot.Expand(123, ctx)).toBe(123);
		expect(Slot.Expand(true, ctx)).toBe(true);
	});

	// NOTE: Object.getPrototypeOf(null) throws TypeError in cells.js.
	// This test documents the null-safety gap -- Slot.Expand should
	// return null/undefined unchanged rather than crashing.
	test("passes through null and undefined unchanged", () => {
		const ctx = {};
		expect(Slot.Expand(null, ctx)).toBe(null);
		expect(Slot.Expand(undefined, ctx)).toBe(undefined);
	});
});

// Bug #1: Slot.Walk has the same null-safety gap as Slot.Expand had
// before the fix. Object.getPrototypeOf(null) throws TypeError.
describe("Slot.Walk", () => {
	test("walks a single Slot", () => {
		const slot = new Slot();
		const result = [...Slot.Walk(slot)];
		expect(result).toEqual([slot]);
	});

	test("walks a plain object of Slots", () => {
		const a = new Slot();
		const b = new Slot();
		const result = [...Slot.Walk({ a, b })];
		expect(result).toContain(a);
		expect(result).toContain(b);
		expect(result).toHaveLength(2);
	});

	test("walks an array of Slots", () => {
		const a = new Slot();
		const b = new Slot();
		const result = [...Slot.Walk([a, b])];
		expect(result).toContain(a);
		expect(result).toContain(b);
		expect(result).toHaveLength(2);
	});

	test("walks a Map of Slots", () => {
		const a = new Slot();
		const b = new Slot();
		const template = new Map([
			["x", a],
			["y", b],
		]);
		const result = [...Slot.Walk(template)];
		expect(result).toContain(a);
		expect(result).toContain(b);
		expect(result).toHaveLength(2);
	});

	test("handles null without throwing", () => {
		const result = [...Slot.Walk(null)];
		expect(result).toEqual([]);
	});

	test("handles undefined without throwing", () => {
		const result = [...Slot.Walk(undefined)];
		expect(result).toEqual([]);
	});

	test("handles primitive values without throwing", () => {
		expect([...Slot.Walk("hello")]).toEqual([]);
		expect([...Slot.Walk(42)]).toEqual([]);
		expect([...Slot.Walk(true)]).toEqual([]);
	});
});
