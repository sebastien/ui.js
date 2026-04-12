import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";
import { Cell } from "../src/js/ui/templates.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

describe("vdom fragment lifecycle", () => {
	beforeEach(() => {
		domish.install();
	});

	test("re-mounting a fragment restores its children", () => {
		const { div, span, b, button } = h;

		const showFragment = new Cell(true);

		const App = () =>
			div(
				showFragment.match((_) =>
					_.case(true, h(undefined, span("Item 1"), b("Item 2"))).else(
						span("Fallback"),
					),
				),
				button(
					{ onClick: () => showFragment.set(!showFragment.get()) },
					"Toggle",
				),
			);

		const root = mountRoot();
		render(App, {}, root);

		const toggle = () => {
			root.querySelector("button").click();
		};

		// Initial state (true)
		expect(root.innerHTML).toContain("<span>Item 1</span><b>Item 2</b>");

		// Toggle to false
		toggle();
		expect(root.innerHTML).toContain("<span>Fallback</span>");
		expect(root.innerHTML).not.toContain("<span>Item 1</span>");

		// Toggle back to true (re-mounting the fragment)
		toggle();
		expect(root.innerHTML).toContain("<span>Item 1</span><b>Item 2</b>");
		expect(root.innerHTML).not.toContain("<span>Fallback</span>");
	});

	test("replacing an existing node with a fragment tracks fragment children correctly", () => {
		const { div, span, b, button } = h;

		const showFragment = new Cell(false);

		// Notice initial state is false, so it mounts a single span.
		// Then toggling to true replaces the span with a fragment.
		const App = () =>
			div(
				showFragment.match((_) =>
					_.case(true, h(undefined, span("A"), b("B"))).else(span("Fallback")),
				),
				button(
					{ onClick: () => showFragment.set(!showFragment.get()) },
					"Toggle",
				),
			);

		const root = mountRoot();
		render(App, {}, root);

		const toggle = () => {
			root.querySelector("button").click();
		};

		// Initial state (false)
		expect(root.innerHTML).toContain("<span>Fallback</span>");

		// Toggle to true (replace span with fragment)
		toggle();
		expect(root.innerHTML).toContain("<span>A</span><b>B</b>");

		// Toggle back to false (unmount the fragment)
		// If tracking was wrong, "A" and "B" won't be unmounted properly.
		toggle();
		expect(root.innerHTML).toContain("<span>Fallback</span>");
		expect(root.innerHTML).not.toContain("<span>A</span>");
		expect(root.innerHTML).not.toContain("<b>B</b>");
	});
});
