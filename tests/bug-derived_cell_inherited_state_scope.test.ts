import { describe, expect, test } from "bun:test";
import { DerivedCell, Signal } from "../src/js/ui/templates.js";
import { Slot } from "../src/js/ui/cells.js";

describe("bug: derived cell inherited state scope", () => {
	test("applyContext allocates own derived state on child contexts", () => {
		const source = new Signal(1);
		const derived = new DerivedCell({ source }, ({ source }) => source + 1);

		const parent = {};
		source.applyContext(parent);
		derived.applyContext(parent);
		expect(Object.hasOwn(parent, derived.id + Slot.State)).toBe(true);

		const child = Object.create(parent);
		source.applyContext(child);
		derived.applyContext(child);

		expect(Object.hasOwn(child, derived.id + Slot.State)).toBe(true);
	});
});
