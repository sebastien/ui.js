import { describe, expect, test } from "bun:test";
import { Extraction } from "../src/js/ui/templates.js";

describe("bug: extraction inherited scope", () => {
	test("applyContext allocates own extraction object per child context", () => {
		const extraction = new Extraction([
			{ path: [0], id: 10001 },
			{ path: [1], id: 10002 },
		]);

		const parent = { 10001: "A", 10002: "B" };
		extraction.applyContext(parent);
		expect(parent[extraction.id]).toEqual(["A", "B"]);

		const child = Object.create(parent);
		child[10001] = "C";
		child[10002] = "D";
		extraction.applyContext(child);

		expect(Object.hasOwn(child, extraction.id)).toBe(true);
		expect(child[extraction.id]).toEqual(["C", "D"]);
		expect(parent[extraction.id]).toEqual(["A", "B"]);
		expect(child[extraction.id]).not.toBe(parent[extraction.id]);
	});
});
