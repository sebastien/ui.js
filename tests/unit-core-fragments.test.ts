import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";
import { h, Fragment, $ } from "../src/js/ui/hyperscript.js";

const mountWithHandle = (Component, data) => {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();

	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "test";
	ctx[Slot.Input] = data;

	const parent = document.createElement("div");
	const node = effect.render(parent, 0, ctx, effector);
	if (node && !node.parentNode) {
		parent.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);

	return { effect, effector, ctx, parent, derivedContext };
};

describe("core fragments", () => {
	beforeEach(() => {
		domish.install();
	});

	test("preserves order of multiple dynamic lists within a fragment", () => {
		// 1. Define our dynamic reactive state
		const itemsA = $.cell(["A1", "A2"]);
		const itemsB = $.cell(["B1", "B2"]);

		// 2. Build the Component
		const App = () =>
			h(
				Fragment,
				null,
				itemsA.map((item) => h("span", { class: "item-a" }, item)),
				itemsB.map((item) => h("span", { class: "item-b" }, item))
			);

		// 3. Mount it
		const { parent, derivedContext } = mountWithHandle(App, {});

		itemsA.set(["A1", "A2"], true, derivedContext);
		itemsB.set(["B1", "B2"], true, derivedContext);

		const getTexts = () =>
			Array.from(parent.childNodes)
				.filter((n) => n.nodeType === 1)
				.map((n) => n.textContent);

		// Step 1: Initial Render
		expect(getTexts()).toEqual(["A1", "A2", "B1", "B2"]);

		// Step 2: Grow itemsA
		itemsA.set(["A1", "A2", "A3"], true, derivedContext);
		expect(getTexts()).toEqual(["A1", "A2", "A3", "B1", "B2"]);

		// Step 3: Grow itemsB
		itemsB.set(["B1", "B2", "B3"], true, derivedContext);
		expect(getTexts()).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);

		// Step 4: Shrink itemsA
		itemsA.set(["A1"], true, derivedContext);
		expect(getTexts()).toEqual(["A1", "B1", "B2", "B3"]);

		// Step 5: Empty itemsA entirely
		itemsA.set([], true, derivedContext);
		expect(getTexts()).toEqual(["B1", "B2", "B3"]);

		// Step 6: Repopulate itemsA
		itemsA.set(["A-NEW"], true, derivedContext);
		expect(getTexts()).toEqual(["A-NEW", "B1", "B2", "B3"]);
	});
});
