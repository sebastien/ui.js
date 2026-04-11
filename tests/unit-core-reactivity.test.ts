import { describe, expect, test } from "bun:test";
import { Context, Observable, Slot } from "../src/js/ui/cells.js";
import { Derivation, Extraction } from "../src/js/ui/templates.js";

describe("unit core reactivity", () => {
	test("Slot manipulation: append remove insert toggle pop", () => {
		const slot = new Slot();
		const ctx = {};
		slot.set([], true, ctx);

		Context.Push(ctx);
		try {
			slot.append("A");
			slot.append("B");
			expect(slot.list()).toEqual(["A", "B"]);

			slot.insert(1, "X");
			expect(slot.list()).toEqual(["A", "X", "B"]);

			slot.remove("X");
			expect(slot.list()).toEqual(["A", "B"]);

			slot.pop();
			expect(slot.list()).toEqual(["A"]);

			slot.set(false);
			expect(slot.toggle()).toBe(true);
			expect(slot.toggle()).toBe(false);
		} finally {
			Context.Pop(ctx);
		}
	});

	test("Observable supports sub/unsub", () => {
		const ctx = {};
		const obs = new Observable(0, ctx, 10);
		const values = [];
		const handler = (value) => values.push(value);

		expect(obs.sub(handler)).toBe(true);
		obs.set(1, true);
		obs.set(2, true);
		expect(values).toEqual([1, 2]);

		expect(obs.unsub(handler)).toBe(true);
		obs.set(3, true);
		expect(values).toEqual([1, 2]);
	});

	test("context inheritance and isolation", () => {
		const parent = {};
		const child = Object.create(parent);
		const a = new Slot();
		const b = new Slot();

		a.set("parent", true, parent);
		expect(child[a.id]).toBe("parent");

		b.set("child", true, child);
		expect(parent[b.id]).toBeUndefined();
		expect(child[b.id]).toBe("child");
	});

		test("Derivation and Extraction apply context", () => {
		const a = new Slot();
		const b = new Slot();
		const ctx = {
			[a.id]: "hello",
			[b.id]: 42,
		};

		const derivation = new Derivation();
		expect(derivation.applyContext(ctx)).toBe(ctx);

		const extraction = new Extraction([
			{ path: ["msg"], id: a.id },
			{ path: ["meta", "count"], id: b.id },
		]);
		extraction.applyContext(ctx);
		expect(ctx[extraction.id].msg).toBe("hello");
		expect(ctx[extraction.id].meta.count).toBe(42);
	});
});
