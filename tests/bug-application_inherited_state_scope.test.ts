import { describe, expect, test } from "bun:test";
import { Slot } from "../src/js/ui/cells.js";
import { Application } from "../src/js/ui/templates.js";

describe("bug: application inherited state scope", () => {
	test("applyContext does not reuse inherited state from parent context", () => {
		const input = {
			id: 8101,
			applyContext: (context) => {
				context[input.id] = context.__value;
				return context;
			},
		};

		const app = new Application(input, (value) => `x:${value}`);

		const parent = { __value: "first" };
		app.applyContext(parent);
		expect(parent[app.id]).toBe("x:first");
		expect(parent[app.id + Slot.State]).toBeDefined();

		const child = Object.create(parent);
		child.__value = "second";
		app.applyContext(child);

		expect(child[app.id]).toBe("x:second");
		expect(Object.hasOwn(child, app.id + Slot.State)).toBe(true);
	});
});
