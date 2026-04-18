import { describe, expect, test } from "bun:test";
import { Slot } from "../src/js/ui/cells.js";

describe("bug: derived registry inherited scope", () => {
	test("Derivations and Dependents maps are own per context", () => {
		const parent = {};
		const child = Object.create(parent);

		const parentDerivations = Slot.Derivations(parent);
		const childDerivations = Slot.Derivations(child);
		expect(childDerivations).not.toBe(parentDerivations);

		const parentDependents = Slot.Dependents(parent);
		const childDependents = Slot.Dependents(child);
		expect(childDependents).not.toBe(parentDependents);
	});
});
