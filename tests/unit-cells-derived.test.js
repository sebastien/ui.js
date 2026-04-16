import { describe, test, expect, beforeEach } from "bun:test";
import { Context, Slot } from "../src/js/ui/cells.js";
import { $ } from "../src/js/ui/hyperscript.js";

describe("Derived Cells Architecture", () => {
	const yieldMicrotask = () =>
		new Promise((resolve) => queueMicrotask(resolve));
	const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	let context;
	beforeEach(() => {
		context = [];
		// Emulate effect/component owner
		context[Slot.Owner] = { id: "test-component" };
	});

	test("1. The Diamond DAG", async () => {
		let executions = 0;
		let d;

		Context.Run(context, () => {
			const a = new Slot();
			a.set(1);

			const b = Slot.Derive({ a }, ({ a }) => a * 2);
			const c = Slot.Derive({ a }, ({ a }) => a + 3);
			d = Slot.Derive({ b, c }, ({ b, c }) => {
				executions++;
				return b + c;
			});

			// Eager evaluation
			expect(d.get()).toBe(6); // (1*2) + (1+3)
			expect(executions).toBe(1);

			// Action: Update A
			a.set(2);
		});

		// Wait for microtask scheduler
		await yieldMicrotask();

		Context.Run(context, () => {
			// b=4, c=5, d=9
			expect(d.get()).toBe(9);
			// D's processor should be called exactly once per update cycle despite multiple inputs changing
			expect(executions).toBe(2);
		});
	});

	test("2. Synchronous Stale Read Prevention", async () => {
		let b,
			executions = 0;

		Context.Run(context, () => {
			const a = new Slot();
			a.set(10);

			b = Slot.Derive({ a }, ({ a }) => {
				executions++;
				return a * 2;
			});

			expect(b.get()).toBe(20);
			expect(executions).toBe(1);

			a.set(20);
			// Immediately get B - forces synchronous flush
			expect(b.get()).toBe(40);
			expect(executions).toBe(2);
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			expect(b.get()).toBe(40);
			// Should not evaluate again during the microtask since it was already flushed
			expect(executions).toBe(2);
		});
	});

	test("3. Cycle Detection", () => {
		Context.Run(context, () => {
			const a = new Slot();
			const b = Slot.Derive({ a }, ({ a }) => a + 1);
			const c = Slot.Derive({ b }, ({ b }) => b + 1);

			// Attempt to create a cycle: A -> B -> C -> A
			expect(() => {
				Slot.Derive({ c }, ({ c }) => c + 1, false, a);
			}).toThrow(/cyclic/i);
		});
	});

	test("4. Promise Race Conditions", async () => {
		let b;
		let a;
		Context.Run(context, () => {
			a = new Slot();
			a.set(1);

			b = Slot.Derive({ a }, async ({ a }) => {
				if (a === 1) {
					await delay(50);
					return "slow-1";
				} else if (a === 2) {
					await delay(10);
					return "fast-2";
				}
				return "none";
			});
		});

		// Immediately set to 2 before 1 finishes
		Context.Run(context, () => {
			a.set(2);
		});

		await delay(60); // Wait for both to finish

		Context.Run(context, () => {
			// B's final value should be the result of the newest cycle (2)
			// The delayed resolution of '1' should be discarded
			expect(b.get()).toBe("fast-2");
		});
	});

	test("5. Context Preservation", async () => {
		let b;
		let a;
		let capturedContext;

		Context.Run(context, () => {
			a = new Slot();
			a.set(10);

			b = Slot.Derive({ a }, ({ a }) => {
				capturedContext = Context.Get();
				return a;
			});
		});

		capturedContext = null;

		// Update A outside of a context, or trigger microtask when stack is empty
		a.set(20, true, context);

		// Microtask runs while stack is empty
		expect(Context.Get()).toBeUndefined();
		await yieldMicrotask();

		// The scheduler must have bound the context correctly during processor execution
		expect(capturedContext).toBe(context);
		Context.Run(context, () => {
			expect(b.get()).toBe(20);
		});
	});

	test("6. Lazy Evaluation", async () => {
		let b;
		let a;
		let executions = 0;

		Context.Run(context, () => {
			a = new Slot();
			a.set(100);

			b = Slot.Derive(
				{ a },
				({ a }) => {
					executions++;
					return a + 1;
				},
				true,
			); // lazy = true

			// Eager eval shouldn't happen
			expect(executions).toBe(0);
		});

		Context.Run(context, () => {
			a.set(200);
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			// Still shouldn't have executed
			expect(executions).toBe(0);

			// Trigger evaluation via get()
			expect(b.get()).toBe(201);
			expect(executions).toBe(1);

			// Multiple gets shouldn't re-evaluate
			expect(b.get()).toBe(201);
			expect(executions).toBe(1);
		});
	});

	test("7. Unmount Abort", async () => {
		let b;
		let a;
		let executions = 0;

		Context.Run(context, () => {
			a = new Slot();
			a.set(1);

			b = Slot.Derive({ a }, ({ a }) => {
				executions++;
				return a * 10;
			});

			expect(executions).toBe(1);

			// Trigger an update
			a.set(2);

			// Clear/unmount context before microtask runs
			// In cells.js, this means context elements are nulled, or we mark it
			// However we implement Context.Clear or an unmount flag
			Context.Clear(context, b.id);
			context[b.id + Slot.Node] = null; // simulate disconnected
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			// Processor should not have been executed for the update
			expect(executions).toBe(1);
		});
	});

	test("8. $.cell creates derived cells", async () => {
		let derived;
		Context.Run(context, () => {
			const a = new Slot();
			a.set(2);
			derived = $.cell({ a }, ({ a }) => a + 1);
			derived.applyContext(context);
			expect(derived.get()).toBe(3);
			a.set(3);
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			expect(derived.get()).toBe(4);
		});
	});

	test("9. $.cell derived dependencies are static", async () => {
		let derived;
		let executions = 0;
		let a;
		let b;
		Context.Run(context, () => {
			a = new Slot();
			b = new Slot();
			a.set(10);
			b.set(50);
			derived = $.cell({ a }, ({ a }) => {
				executions++;
				// Read b, but b is intentionally not in shape.
				return a + b.get();
			});
			derived.applyContext(context);
			expect(derived.get()).toBe(60);
			expect(executions).toBe(1);
			b.set(60);
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			// No re-evaluation because b is not tracked.
			expect(executions).toBe(1);
			a.set(20);
		});

		await yieldMicrotask();

		Context.Run(context, () => {
			expect(derived.get()).toBe(80);
			expect(executions).toBe(2);
		});
	});

	test("10. Slot.update merges plain objects without mutating original", () => {
		Context.Run(context, () => {
			const item = new Slot();
			item.set({ label: "Old", editing: false });
			const original = item.get();

			const updated = item.update({ label: "New", done: true });

			expect(updated).not.toBe(original);
			expect(original).toEqual({ label: "Old", editing: false });
			expect(item.get()).toEqual({ label: "New", editing: false, done: true });
		});
	});

	test("11. Slot.touch notifies even when value is unchanged", () => {
		Context.Run(context, () => {
			const value = new Slot();
			value.set(42);
			let notifications = 0;
			Slot.Sub(context, value.id, () => {
				notifications++;
			});

			value.touch();
			value.touch();

			expect(notifications).toBe(2);
		});
	});

	test("12. Slot.update initializes non-object values with patch", () => {
		Context.Run(context, () => {
			const value = new Slot();
			value.set("text");

			value.update({ edited: true });

			expect(value.get()).toEqual({ edited: true });
		});
	});
});
