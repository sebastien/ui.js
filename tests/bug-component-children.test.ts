import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

describe("component children passing", () => {
	beforeEach(() => {
		installDom();
	});

	test("wrapper component renders a single component child passed via children", () => {
		const Child = () => h.span("Child Node");
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = () => h(Wrapper, null, h(Child));

		const { parent } = mountWithHandle(App, {});
		expect(parent.textContent).toContain("Child Node");
	});

	test("wrapper component renders multiple passed children in order", () => {
		const Child1 = () => h.span("One");
		const Child2 = () => h.span("Two");
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = () => h(Wrapper, null, h(Child1), h(Child2));

		const { parent } = mountWithHandle(App, {});
		expect(parent.textContent).toContain("OneTwo");
	});

	test("primitive children still render as text (no regression)", () => {
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = ({ text }) => h(Wrapper, null, "Hello ", text);

		const { parent } = mountWithHandle(App, { text: "World" });
		expect(parent.textContent).toContain("Hello World");
	});

	test("mixed children (text + component/effect) render correctly", () => {
		const Child = () => h.span("Component");
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = ({ text }) =>
			h(Wrapper, null, "Prefix ", h(Child), " Suffix ", text);

		const { parent } = mountWithHandle(App, { text: "Dynamic" });
		expect(parent.textContent).toContain("Prefix Component Suffix Dynamic");
	});

	test("Scope preservation: wrapper component renders a child that references a reactive cell from the parent's scope", () => {
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = ({ counter }) => {
			const Child = ({ v }) => h.span(v);
			return h(Wrapper, null, h(Child, { v: counter }));
		};

		const { parent } = mountWithHandle(App, { counter: 1 });
		expect(parent.textContent).toContain("1");
	});

	test("slot child transitions between text and template", () => {
		const value = $.cell("T");
		const Child = () => h.span("C");
		const Wrapper = ({ children }) => h.div({ class: "wrapper" }, children);
		const App = () =>
			h(
				Wrapper,
				null,
				value.apply((v) => v),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		value.set("T", true, derivedContext);
		expect(parent.textContent).toContain("T");

		value.set(h(Child), true, derivedContext);
		expect(parent.textContent).toContain("C");

		value.set("Z", true, derivedContext);
		expect(parent.textContent).toContain("Z");
	});
});
