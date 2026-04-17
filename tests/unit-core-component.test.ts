import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

describe("unit core component", () => {
	beforeEach(() => {
		installDom();
	});

	test("ComponentEffect mounts static component", () => {
		const Label = ({ text }) => h.span(text);
		const App = ({ message }) => h.div(h(Label, { text: message }));
		const { parent } = mountWithHandle(App, { message: "Hello" });
		expect(parent.textContent).toContain("Hello");
	});

	test("DynamicComponentEffect resolves component from slot", () => {
		const A = ({ value }) => h.span("A", value);
		const B = ({ value }) => h.span("B", value);
		const App = ({ current, value }) => h.div(h(current, { value: value }));

		const { parent } = mountWithHandle(App, { current: A, value: "x" });
		expect(parent.textContent).toContain("A");

		const { parent: parentB } = mountWithHandle(App, {
			current: B,
			value: "y",
		});
		expect(parentB.textContent).toContain("B");
	});

	test("ComponentEffect throws clear error when component forgets to return template", () => {
		function MissingLabel({ text }) {
			h.span(text);
		}
		const App = ({ message }) => h.div(h(MissingLabel, { text: message }));

		expect(() => mountWithHandle(App, { message: "Hello" })).toThrow(
			'Component "MissingLabel" is missing a template',
		);
	});

	test("DynamicComponentEffect throws clear error when selected component forgets to return template", () => {
		function MissingDynamic({ value }) {
			h.span(value);
		}
		const App = ({ current, value }) => h.div(h(current, { value: value }));

		expect(() =>
			mountWithHandle(App, { current: MissingDynamic, value: "x" }),
		).toThrow(/Component "(MissingDynamic|<anonymous>)" is missing a template/);
	});

	test("DynamicEvaluation computes value in context", () => {
		const App = ({ a, b }) => h.div($(() => a.get() + b.get()));
		const { parent } = mountWithHandle(App, { a: 5, b: 7 });
		expect(parent.textContent).toContain("12");
	});
});
