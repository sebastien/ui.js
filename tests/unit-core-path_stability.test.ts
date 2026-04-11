import { beforeEach, describe, expect, test } from "bun:test";
import { h, Fragment, $ } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle, findFirstByNodeName } from "./test-utils.ts";

describe("unit core path stability", () => {
	beforeEach(() => {
		installDom();
	});

	test("binds event handlers inside non-leading fragments", () => {
		let calls = 0;
		const App = () =>
			h.div(
				h.span("lead"),
				h(Fragment, null, h.button({ onClick: () => calls++ }, "Edit"))
			);

		const { parent } = mountWithHandle(App, {});
		const button = findFirstByNodeName(parent, "button");

		expect(button).toBeDefined();
		button?.click();
		expect(calls).toBe(1);
	});

	test("keeps event binding for siblings after expanded fragments", () => {
		let calls = 0;
		const App = () =>
			h.div(
				h(Fragment, null, h.span("A"), h.span("B")),
				h.button({ onClick: () => calls++ }, "Go")
			);

		const { parent } = mountWithHandle(App, {});
		const button = findFirstByNodeName(parent, "button");

		expect(button).toBeDefined();
		button?.click();
		expect(calls).toBe(1);
	});

	test("restores canonical structure when managed nodes are moved externally", () => {
		let calls = 0;
		const tick = $.cell(0);
		const App = ({ tick }) =>
			h.div(
				h.button({ onClick: () => calls++ }, "Go"),
				h.span(tick.apply((value) => `${value}`))
			);

		const { parent, derivedContext } = mountWithHandle(App, { tick });
		const host = findFirstByNodeName(parent, "div");
		const moved = findFirstByNodeName(parent, "button");
		expect(host).toBeDefined();
		expect(moved).toBeDefined();
		const external = document.createElement("aside");
		parent.appendChild(external);
		external.appendChild(moved);

		tick.set(1, true, derivedContext);

		const restored = findFirstByNodeName(host, "button");
		expect(restored).toBeDefined();
		restored?.click();
		expect(calls).toBe(1);
	});

	test("keeps managed bindings stable across external sibling insertions and removals", () => {
		let calls = 0;
		const tick = $.cell(0);
		const App = ({ tick }) =>
			h.div(
				h.button({ onClick: () => calls++ }, "Go"),
				h.span(tick.apply((value) => `Tick ${value}`))
			);

		const { parent, derivedContext } = mountWithHandle(App, { tick });
		const host = findFirstByNodeName(parent, "div");
		const button = findFirstByNodeName(parent, "button");
		expect(host).toBeDefined();
		expect(button).toBeDefined();

		const before = document.createElement("i");
		before.appendChild(document.createTextNode("before"));
		const after = document.createElement("i");
		after.appendChild(document.createTextNode("after"));

		host.insertBefore(before, host.firstChild);
		host.appendChild(after);

		tick.set(1, true, derivedContext);

		host.removeChild(before);
		host.removeChild(after);

		const stableButton = findFirstByNodeName(host, "button");
		expect(stableButton).toBeDefined();
		stableButton?.click();
		expect(calls).toBe(1);
	});
});
