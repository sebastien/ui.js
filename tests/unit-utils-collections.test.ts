import { describe, expect, test } from "bun:test";
import { iterkeys, keys } from "../src/js/ui/utils/collections.js";

// Bug #2: iterkeys() uses `return v.keys()` inside a generator
// function for the Map branch. In a generator, `return` terminates
// the generator and sets the done-value -- for...of never sees it.
// The correct code should be `yield* v.keys()`.
describe("iterkeys", () => {
	test("yields keys for an array", () => {
		const result = [...iterkeys(["a", "b", "c"])];
		expect(result).toEqual(["0", "1", "2"]);
	});

	test("yields keys for a plain object", () => {
		const result = [...iterkeys({ x: 1, y: 2 })];
		expect(result).toContain("x");
		expect(result).toContain("y");
		expect(result).toHaveLength(2);
	});

	test("yields keys for a Map", () => {
		const map = new Map([
			["alpha", 1],
			["beta", 2],
			["gamma", 3],
		]);
		const result = [...iterkeys(map)];
		expect(result).toContain("alpha");
		expect(result).toContain("beta");
		expect(result).toContain("gamma");
		expect(result).toHaveLength(3);
	});

	test("yields nothing for undefined", () => {
		const result = [...iterkeys(undefined)];
		expect(result).toEqual([]);
	});
});

describe("keys", () => {
	test("returns array of keys for a Map", () => {
		const map = new Map([
			["a", 1],
			["b", 2],
		]);
		const result = keys(map);
		expect(result).toContain("a");
		expect(result).toContain("b");
		expect(result).toHaveLength(2);
	});

	test("returns array of keys for a plain object", () => {
		const result = keys({ foo: 1, bar: 2 });
		expect(result).toContain("foo");
		expect(result).toContain("bar");
		expect(result).toHaveLength(2);
	});
});
