import { describe, expect, test } from "bun:test";
import { $ } from "../src/js/ui/hyperscript.js";
import { Context } from "../src/js/ui/cells.js";

describe("core $.get proxy", () => {
	test("returns first-level selections from object cell", () => {
		const node = $.cell(null);
		const get = $.get(node);
		const name = get.name;
		const content = get.content;

		const context = [];
		Context.Run(context, () => {
			node.observable(context);
			node.set({ name: "Alice", content: "Hello" });
			name.applyContext(context);
			content.applyContext(context);
		});

		expect(context[name.id]).toBe("Alice");
		expect(context[content.id]).toBe("Hello");
	});

	test("supports destructuring", () => {
		const node = $.cell(null);
		const { name, content } = $.get(node);

		const context = [];
		Context.Run(context, () => {
			node.observable(context);
			node.set({ name: "N", content: "C" });
			name.applyContext(context);
			content.applyContext(context);
		});

		expect(context[name.id]).toBe("N");
		expect(context[content.id]).toBe("C");
	});

	test("is null-safe and resolves missing values to undefined", () => {
		const node = $.cell(null);
		const { name } = $.get(node);

		const context = [];
		Context.Run(context, () => {
			node.observable(context);
			node.set(null);
			name.applyContext(context);
		});

		expect(context[name.id]).toBeUndefined();
	});
});
