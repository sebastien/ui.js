import { describe, expect, test } from "bun:test";
import { Context, Observable, Slot } from "../src/js/ui/cells.js";
import { Subscription } from "../src/js/ui/templates.js";

// Bug #5: Slot.update() mutates the current value in-place via
// Object.assign(current, patch). Subscribers that captured the
// previous value for diffing see the already-mutated object.
describe("Slot.update", () => {
	test("update does not mutate the previously held value", () => {
		const ctx = {};
		const slot = new Slot();
		Context.Push(ctx);
		try {
			slot.set({ x: 1, y: 2 }, true);
			const before = slot.get();

			slot.update({ x: 10 });

			// The original object captured before the update should be untouched
			expect(before.x).toBe(1);
			expect(before.y).toBe(2);
		} finally {
			Context.Pop(ctx);
		}
	});

	test("subscriber receives distinct old and new references", () => {
		const ctx = {};
		const slot = new Slot();
		const snapshots = [];

		Context.Push(ctx);
		try {
			slot.set({ count: 0 }, true);

			// Capture the value at each notification
			Slot.Sub(ctx, slot.id, (value) => {
				snapshots.push(structuredClone(value));
			});

			slot.update({ count: 1 });
			slot.update({ count: 2 });

			// Each snapshot should reflect the value at that point in time
			expect(snapshots[0]).toEqual({ count: 1 });
			expect(snapshots[1]).toEqual({ count: 2 });
			// They should be different objects, not the same reference
			expect(snapshots[0]).not.toBe(snapshots[1]);
		} finally {
			Context.Pop(ctx);
		}
	});

	test("Observable.update has the same issue", () => {
		const ctx = {};
		const obs = new Observable({ a: 1 }, ctx, new Slot().id);

		const before = obs.get();
		obs.update({ a: 99 });

		// The original object captured before update should be untouched
		expect(before.a).toBe(1);
	});
});

// Bug #7: Slot.at() getter uses Array.prototype.at() which handles
// negative indices, but the setter uses v[i] = value with direct
// bracket assignment. Negative indices create named string properties
// instead of setting the intended element.
describe("Slot.at", () => {
	test("at(-1) getter returns last element", () => {
		const ctx = {};
		const slot = new Slot();
		Context.Push(ctx);
		try {
			slot.set(["a", "b", "c"], true);
			expect(slot.at(-1)).toBe("c");
		} finally {
			Context.Pop(ctx);
		}
	});

	test("at(-1, value) setter replaces last element", () => {
		const ctx = {};
		const slot = new Slot();
		Context.Push(ctx);
		try {
			slot.set(["a", "b", "c"], true);
			slot.at(-1, "Z");

			const result = slot.get();
			expect(result).toEqual(["a", "b", "Z"]);
			// Must not have created a "-1" string property
			expect(result).toHaveLength(3);
			expect(Object.keys(result).includes("-1")).toBe(false);
		} finally {
			Context.Pop(ctx);
		}
	});

	test("at(-2, value) setter replaces second-to-last element", () => {
		const ctx = {};
		const slot = new Slot();
		Context.Push(ctx);
		try {
			slot.set(["a", "b", "c"], true);
			slot.at(-2, "Y");

			const result = slot.get();
			expect(result).toEqual(["a", "Y", "c"]);
			expect(result).toHaveLength(3);
		} finally {
			Context.Pop(ctx);
		}
	});

	test("at(0, value) setter still works for positive indices", () => {
		const ctx = {};
		const slot = new Slot();
		Context.Push(ctx);
		try {
			slot.set(["a", "b", "c"], true);
			slot.at(0, "X");
			expect(slot.get()).toEqual(["X", "b", "c"]);
		} finally {
			Context.Pop(ctx);
		}
	});
});

// Bug #8: Subscription.applyContext subscribes an updater to each
// input slot in the parent context, but there is no corresponding
// unsubscribe path. When the subscription is no longer needed, the
// handlers remain in the parent's subscriber arrays.
describe("Subscription cleanup", () => {
	test("Subscription.applyContext subscriptions can be cleaned up", () => {
		const parentCtx = [];
		parentCtx[Slot.Owner] = { id: "test" };

		const slotA = new Slot();
		const slotB = new Slot();
		slotA.set(1, true, parentCtx);
		slotB.set(2, true, parentCtx);

		const sub = new Subscription({ a: slotA, b: slotB });

		// Apply context creates subscriptions on the parent context
		Context.Push(parentCtx);
		try {
			const derived = sub.applyContext(parentCtx);

			// Verify subscriptions exist on the parent context
			const subsA = parentCtx[slotA.id + Slot.Observable] || [];
			const subsB = parentCtx[slotB.id + Slot.Observable] || [];
			const countA = subsA.length;
			const countB = subsB.length;
			expect(countA).toBeGreaterThan(0);
			expect(countB).toBeGreaterThan(0);

			// Now simulate cleanup -- the updater is stored in state
			const updater = derived[sub.id + Slot.State];
			expect(updater).toBeDefined();

			// Manually unsub to simulate what an unrender should do
			Slot.Unsub(parentCtx, slotA.id, updater);
			Slot.Unsub(parentCtx, slotB.id, updater);

			// Subscriptions should be reduced
			const afterA = parentCtx[slotA.id + Slot.Observable] || [];
			const afterB = parentCtx[slotB.id + Slot.Observable] || [];
			expect(afterA.length).toBe(countA - 1);
			expect(afterB.length).toBe(countB - 1);
		} finally {
			Context.Pop(parentCtx);
		}
	});

	test("Subscription leaves stale handlers without explicit cleanup", () => {
		const parentCtx = [];
		parentCtx[Slot.Owner] = { id: "test" };

		const slot = new Slot();
		slot.set(10, true, parentCtx);

		const sub = new Subscription(slot);
		const notifications = [];

		Context.Push(parentCtx);
		try {
			const derived = sub.applyContext(parentCtx);

			// Subscribe to the derived value to track notifications
			Slot.Sub(derived, sub.id, (v) => notifications.push(v));

			// Simulate unmount by clearing the derived context state
			// (this is what Context.Clear does -- nullify slots)
			derived[sub.id] = null;
			derived[sub.id + 1] = null;
			derived[sub.id + 2] = null;
			derived[sub.id + 3] = null;
			derived[sub.id + 4] = null;
			derived[sub.id + 5] = null;

			// The updater was subscribed to the PARENT context's slot.
			// Even after clearing the derived context, changing the
			// parent slot still fires the stale updater.
			const subsOnSlot = parentCtx[slot.id + Slot.Observable] || [];
			// BUG: There should be 0 subscriptions after cleanup,
			// but the updater is still registered.
			expect(subsOnSlot.length).toBeGreaterThan(0);
		} finally {
			Context.Pop(parentCtx);
		}
	});
});
