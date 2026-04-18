import { describe, expect, test } from "bun:test";
import { Cell } from "../src/js/ui/templates.js";
import { Slot } from "../src/js/ui/cells.js";

describe("bug: cell inherited state scope", () => {
	test("applyContext allocates own state/value on child contexts", () => {
		const cell = new Cell("parent");

		const parent = {};
		cell.applyContext(parent);
		expect(parent[cell.id]).toBe("parent");
		expect(Object.hasOwn(parent, cell.id + Slot.State)).toBe(true);

		const child = Object.create(parent);
		cell.applyContext(child);

		expect(Object.hasOwn(child, cell.id + Slot.State)).toBe(true);
		expect(Object.hasOwn(child, cell.id)).toBe(true);
		expect(child[cell.id]).toBe("parent");
	});
});
