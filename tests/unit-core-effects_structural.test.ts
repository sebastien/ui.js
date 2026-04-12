import { beforeEach, describe, expect, test } from "bun:test";
import { h } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

describe("unit core effects structural", () => {
	beforeEach(() => {
		installDom();
	});

	test("MappingEffect renders list from input", () => {
		const App = ({ items }) => h.div(items.map((item) => h.span(item)));
		const { parent } = mountWithHandle(App, { items: ["A", "B", "C"] });
		expect(parent.textContent).toContain("ABC");
	});

	test("ConditionalEffect chooses expected branch", () => {
		const App = ({ mode }) =>
			h.div(
				mode.match(
					(_) => _.case("on", h.span("ON")),
					(_) => _.else(h.span("OFF")),
				),
			);
		const { parent } = mountWithHandle(App, { mode: "on" });
		expect(parent.textContent).toContain("ON");
	});

	test("ConditionalEffect supports primitive branch values", () => {
		const App = ({ mode }) =>
			h.div(mode.match((_) => _.case("on", "ON").else("OFF")));
		const { parent } = mountWithHandle(App, { mode: "on" });
		expect(parent.textContent).toContain("ON");
	});

	test("TemplateEffect mounts nested component", () => {
		const Child = ({ text }) => h.span(text);
		const App = ({ text }) => h.div(h(Child, { text }));
		const { parent } = mountWithHandle(App, { text: "x" });
		expect(parent.textContent).toContain("x");
	});
});
