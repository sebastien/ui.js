import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

function VSplitter({ left, right, width }) {
	const splitterWidth = width?.apply ? width : $.cell(200);
	const leftStyle = splitterWidth.apply((w) => ({
		width: `calc(${w ?? 200}px - 4px)`,
	}));
	const rightStyle = splitterWidth.apply((w) => ({
		left: `calc(${w ?? 200}px - 4px)`,
	}));
	const dividerStyle = splitterWidth.apply((w) => ({
		left: `calc(${w ?? 200}px - 4px)`,
	}));
	return h(
		"div",
		{ class: "fit abs" },
		h("div", { class: "fit abs", style: leftStyle }, left),
		h("div", { class: "fit-h abs", style: dividerStyle }),
		h("div", { class: "fit abs", style: rightStyle }, right),
	);
}

describe("bug: splitter template props", () => {
	beforeEach(() => {
		installDom();
	});

	test("renders template props passed through non-children slots", () => {
		const Pane = ({ label }) => h("span", { class: "pane" }, label);
		const App = () =>
			h(VSplitter, {
				width: $.cell(180),
				left: h(Pane, { label: "LEFT" }),
				right: h(Pane, { label: "RIGHT" }),
			});

		const { parent } = mountWithHandle(App, {});
		expect(parent.textContent).toContain("LEFT");
		expect(parent.textContent).toContain("RIGHT");
		expect(parent.textContent).not.toContain("[object Object]");
		expect(parent.textContent).not.toContain("undefined");
	});

	test("uses a stable default width when width prop is omitted", () => {
		const App = () =>
			h(VSplitter, {
				left: h("span", null, "L"),
				right: h("span", null, "R"),
			});

		const { parent } = mountWithHandle(App, {});
		expect(parent.textContent).toContain("L");
		expect(parent.textContent).toContain("R");
		expect(parent.innerHTML).not.toContain("undefinedpx");
	});
});
