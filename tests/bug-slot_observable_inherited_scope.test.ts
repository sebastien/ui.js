import { describe, expect, test } from "bun:test";
import { Slot } from "../src/js/ui/cells.js";

describe("bug: slot observable inherited scope", () => {
	test("subscribing in child context does not mutate parent observer list", () => {
		const id = 12001;
		const parent = {};
		const child = Object.create(parent);

		const parentHandler = () => {};
		const childHandler = () => {};

		Slot.Sub(parent, id, parentHandler);
		expect(parent[id + Slot.Observable]?.length).toBe(1);

		Slot.Sub(child, id, childHandler);

		expect(Object.hasOwn(child, id + Slot.Observable)).toBe(true);
		expect(child[id + Slot.Observable]).not.toBe(parent[id + Slot.Observable]);
		expect(parent[id + Slot.Observable]?.length).toBe(1);
		expect(child[id + Slot.Observable]?.length).toBe(1);
	});
});
