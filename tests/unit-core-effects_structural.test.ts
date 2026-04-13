import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { MappingEffect } from "../src/js/ui/effects.js";
import { Selection } from "../src/js/ui/templates.js";
import {
	findAllByNodeName,
	installDom,
	mountWithHandle,
} from "./test-utils.ts";

describe("unit core effects structural", () => {
	beforeEach(() => {
		installDom();
	});

	test("MappingEffect renders list from input", () => {
		const App = ({ items }) => h.div(items.map((item) => h.span(item)));
		const { parent } = mountWithHandle(App, { items: ["A", "B", "C"] });
		expect(parent.textContent).toContain("ABC");
	});

	test("key attribute is reserved and not rendered to the DOM", () => {
		const App = () => h.ul(h.li({ key: "stable" }, "A"));
		const { parent } = mountWithHandle(App, {});
		const li = findAllByNodeName(parent, "li")[0];
		expect(li).toBeDefined();
		expect(li?.getAttribute("key")).toBeNull();
	});

	test("MappingEffect resolves template key attribute when keyBy is omitted", () => {
		const items = $.cell([
			{ id: 1, label: "A" },
			{ id: 2, label: "B" },
			{ id: 3, label: "C" },
		]);
		const valueSlot = new Selection();
		const keySlot = new Selection();
		const effect = new MappingEffect(
			items,
			(item) => h.li({ key: item.apply((_) => _?.id) }, item),
			valueSlot,
			keySlot,
		);
		expect(effect.resolveKey({ id: 42 }, 3, {})).toBe(42);
	});

	test("MappingEffect keeps keyBy precedence over template key attribute", () => {
		const items = $.cell([{ id: 1 }]);
		const valueSlot = new Selection();
		const keySlot = new Selection();
		const effect = new MappingEffect(
			items,
			(item) => h.li({ key: item.apply((_) => _?.id) }, item),
			valueSlot,
			keySlot,
			(_raw, index) => index,
		);
		expect(effect.resolveKey({ id: 42 }, 3, {})).toBe(3);
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
