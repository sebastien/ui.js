import { describe, expect, test } from "bun:test";
import { Context, Slot } from "../src/js/ui/cells.js";
import { DynamicEvaluation } from "../src/js/ui/templates.js";

// Bug #6: DynamicEvaluation.applyContext stores the computed value
// on `this.value` (the shared instance), not just in the context.
// When the same DynamicEvaluation is used across multiple contexts,
// one context's evaluation overwrites another's `this.value`.
describe("DynamicEvaluation shared instance state", () => {
	test("applyContext stores value in context array", () => {
		const ctx = [];
		ctx[Slot.Owner] = { id: "test" };
		const slot = new Slot();
		slot.set(42, true, ctx);

		const dynEval = new DynamicEvaluation(() => slot.get());
		Context.Run(ctx, () => dynEval.applyContext(ctx));

		expect(ctx[dynEval.id]).toBe(42);
	});

	test("two contexts get independent values in context arrays", () => {
		const ctx1 = [];
		ctx1[Slot.Owner] = { id: "test1" };
		const slot1 = new Slot();
		slot1.set(10, true, ctx1);

		const ctx2 = [];
		ctx2[Slot.Owner] = { id: "test2" };
		const slot2 = new Slot();
		// Use the same slot id space but different context
		slot2.set(20, true, ctx2);

		// Same DynamicEvaluation instance, different contexts
		const dynEval = new DynamicEvaluation(function () {
			// Read whichever slot is in the current context
			const ctx = Context.Get();
			return ctx === ctx1 ? slot1.get() : slot2.get();
		});

		Context.Run(ctx1, () => dynEval.applyContext(ctx1));
		Context.Run(ctx2, () => dynEval.applyContext(ctx2));

		// Context arrays should have independent values
		expect(ctx1[dynEval.id]).toBe(10);
		expect(ctx2[dynEval.id]).toBe(20);

		// BUG: this.value on the shared instance reflects only the
		// last applyContext call. Code that reads dynEval.value instead
		// of context[dynEval.id] will get the wrong answer for ctx1.
		expect(dynEval.value).not.toBe(ctx1[dynEval.id]);
		// dynEval.value is 20 (from ctx2), but ctx1 expects 10
	});
});
