import { describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import { Context, Slot } from "../src/js/ui/cells.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

describe("unit core cell overloads", () => {
	test("initializes plain cells with their source value", () => {
		const ctx = {};
		const value = $.cell("Hello");
		value.applyContext(ctx);

		Context.Run(ctx, () => {
			expect(value.get()).toBe("Hello");
		});
	});

	test("supports single-slot derived shorthand", () => {
		const ctx = {};
		const source = new Slot();
		source.set("alpha", true, ctx);

		const mapped = $.cell(source, (value) => value.toUpperCase());
		mapped.applyContext(ctx);

		Context.Run(ctx, () => {
			expect(mapped.get()).toBe("ALPHA");
		});

		source.set("beta", true, ctx);
		Context.Run(ctx, () => {
			expect(mapped.get()).toBe("BETA");
		});
	});

	test("supports shorthand when source is a Cell selection", () => {
		const ctx = {};
		const source = $.cell("# Hello\n\nBody\n");
		const mapped = $.cell(source, (value) => value.length);
		mapped.applyContext(ctx);

		Context.Run(ctx, () => {
			expect(mapped.get()).toBeGreaterThan(0);
		});

		source.set("# Hi\n\nBody\n", true, ctx);
		Context.Run(ctx, () => {
			expect(mapped.get()).toBe("# Hi\n\nBody\n".length);
		});
	});

	test("supports single-slot derived shorthand with lazy mode", () => {
		const ctx = {};
		const source = new Slot();
		source.set(1, true, ctx);
		let computes = 0;

		const mapped = $.cell(
			source,
			(value) => {
				computes += 1;
				return value + 1;
			},
			true,
		);
		mapped.applyContext(ctx);
		expect(computes).toBe(0);

		Context.Run(ctx, () => {
			expect(mapped.get()).toBe(2);
		});
		expect(computes).toBe(1);

		source.set(2, true, ctx);
		expect(computes).toBe(1);
		Context.Run(ctx, () => {
			expect(mapped.get()).toBe(3);
		});
		expect(computes).toBe(2);
	});

	test("supports extractor before derivation for single-slot shorthand", () => {
		const ctx = {};
		const source = new Slot();
		source.set(" 41 ", true, ctx);

		const mapped = $.cell(
			source,
			(value) => value + 1,
			false,
			(raw) => Number(raw.trim()),
		);
		mapped.applyContext(ctx);

		Context.Run(ctx, () => {
			expect(mapped.get()).toBe(42);
		});
	});

	test("keeps legacy cell(slot, updater, extractor) behavior", () => {
		const ctx = {};
		const source = new Slot();
		source.set(2, true, ctx);
		const seen = [];

		const legacy = $.cell(
			source,
			(value) => seen.push(value),
			(raw) => raw * 2,
		);
		legacy.applyContext(ctx);

		source.set(5, true, ctx);
		expect(seen.at(-1)).toBe(10);
	});

	test("resolves derived cell props before component access", () => {
		installDom();
		const source = $.cell({ children: [1, 2] });
		const root = $.cell(source, (value) => value);

		const Child = ({ node }) => h.div(node.apply((_) => _.children.length));
		const App = () => h(Child, { node: root });
		const { parent } = mountWithHandle(App, {});

		expect(parent.textContent).toContain("2");
	});
});
