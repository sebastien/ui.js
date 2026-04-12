import { beforeEach, describe, expect, test } from "bun:test";
import { h, $, Fragment } from "../src/js/ui/hyperscript.js";
import {
	installDom,
	mountWithHandle,
	findAllByNodeName,
} from "./test-utils.ts";

describe("vdom fragment lifecycle", () => {
	beforeEach(() => {
		installDom();
	});

	test("re-mounting a fragment restores its children", () => {
		const showFragment = $.cell(true);

		const App = () =>
			h.div(
				showFragment.match(
					(_) =>
						_.case(true, h(Fragment, null, h.span("Item 1"), h.b("Item 2"))),
					(_) => _.else(h.span("Fallback")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		showFragment.set(true, true, derivedContext);

		// Initial state (true): fragment children present
		expect(parent.textContent).toContain("Item 1");
		expect(parent.textContent).toContain("Item 2");
		expect(findAllByNodeName(parent, "span").length).toBe(1);
		expect(findAllByNodeName(parent, "b").length).toBe(1);

		// Toggle to false
		showFragment.set(false, true, derivedContext);
		expect(parent.textContent).toContain("Fallback");
		expect(parent.textContent).not.toContain("Item 1");
		expect(parent.textContent).not.toContain("Item 2");

		// Toggle back to true (re-mounting the fragment)
		showFragment.set(true, true, derivedContext);
		expect(parent.textContent).toContain("Item 1");
		expect(parent.textContent).toContain("Item 2");
		expect(parent.textContent).not.toContain("Fallback");
	});

	test("replacing an existing node with a fragment tracks fragment children correctly", () => {
		const showFragment = $.cell(false);

		// Initial state is false, so it mounts a single span.
		// Toggling to true replaces the span with a fragment.
		const App = () =>
			h.div(
				showFragment.match(
					(_) => _.case(true, h(Fragment, null, h.span("A"), h.b("B"))),
					(_) => _.else(h.span("Fallback")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		showFragment.set(false, true, derivedContext);

		// Initial state (false)
		expect(parent.textContent).toContain("Fallback");

		// Toggle to true (replace span with fragment)
		showFragment.set(true, true, derivedContext);
		expect(parent.textContent).toContain("A");
		expect(parent.textContent).toContain("B");
		expect(parent.textContent).not.toContain("Fallback");

		// Toggle back to false (unmount the fragment)
		// If tracking was wrong, "A" and "B" won't be unmounted properly.
		showFragment.set(false, true, derivedContext);
		expect(parent.textContent).toContain("Fallback");
		expect(parent.textContent).not.toContain("A");
		expect(parent.textContent).not.toContain("B");
	});
});
