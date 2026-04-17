import { describe, expect, test } from "bun:test";
import { Context, Slot } from "../src/js/ui/cells.js";

const INJECTION_ALIASES = Symbol.for("ui.injection.aliases");

describe("slot alias local invalidation", () => {
	test("setting an aliased local slot invalidates local derived dependencies", () => {
		const parent = [] as any[];
		const local = [] as any[];
		local[Slot.Parent] = parent;

		const source = new Slot();
		const injected = new Slot();

		let deriveRuns = 0;
		let derived;

		Context.Run(parent, () => {
			source.set("hello", true);
		});

		local[INJECTION_ALIASES] = new Map([
			[
				injected.id,
				{
					sourceId: source.id,
					sourceContext: parent,
				},
			],
		]);

		Context.Run(local, () => {
			Slot.Notify(local, injected.id, "hello", true);
			derived = Slot.Derive({ injected }, ({ injected }) => {
				deriveRuns += 1;
				return String(injected).toUpperCase();
			});
			expect(derived.get()).toBe("HELLO");
			expect(deriveRuns).toBe(1);

			injected.set("world", true);

			expect(parent[source.id]).toBe("world");
			expect(derived.get()).toBe("WORLD");
			expect(deriveRuns).toBe(2);
		});
	});
});
