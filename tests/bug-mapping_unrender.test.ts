import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { Slot } from "../src/js/ui/cells.js";
import { MappingEffect } from "../src/js/ui/effects.js";
import { component } from "../src/js/ui/templates.js";
import {
	installDom,
	mountWithHandle,
	findFirstByNodeName,
} from "./test-utils.ts";

// Bug #9: MappingEffect.unrender calls this.unsubrender(context)
// directly instead of super.unrender(context, effector). This means:
// 1. It doesn't clear context[this.id + Slot.Node] (node cache)
// 2. It would miss any future cleanup logic added to Effect.unrender()
//
// This test verifies that after unmounting a mapped list, the node
// cache slot is properly cleaned up.
describe("bug MappingEffect unrender cleanup", () => {
	beforeEach(() => {
		installDom();
	});

	test("mapped list node cache is cleared after unrender", () => {
		const App = ({ list }) => h.ul(list.map((item) => h.li(item)));
		const comp = component(App);
		const mapping = comp.template.children.find(
			(_) => _ instanceof MappingEffect,
		);
		expect(mapping).toBeDefined();
		const { parent, effect, effector, ctx, derivedContext } = mountWithHandle(
			App,
			{
				list: ["a", "b", "c"],
			},
		);

		const ul = findFirstByNodeName(parent, "ul");
		expect(ul).toBeDefined();

		// Count actual <li> elements (excluding comment placeholders)
		let liCount = 0;
		for (const child of ul.childNodes) {
			if (child.nodeName?.toLowerCase() === "li") {
				liCount++;
			}
		}
		expect(liCount).toBe(3);
		expect(derivedContext[mapping.id + Slot.State]).toBeDefined();

		// Unrender the entire component
		effect.unrender(ctx, effector);

		// Regression check (#9): MappingEffect.unrender must clear state
		// and node cache and run base Effect cleanup.
		expect(derivedContext[mapping.id + Slot.State]).toBeUndefined();
		expect(derivedContext[mapping.id + Slot.Node]).toBeUndefined();
		expect(derivedContext[mapping.id + Slot.Render]).toBeUndefined();
	});

	test("mapped list renders items correctly", () => {
		const App = ({ list }) => h.div(list.map((item) => h.span(item)));
		const { parent } = mountWithHandle(App, {
			list: ["x", "y", "z"],
		});

		expect(parent.textContent).toContain("x");
		expect(parent.textContent).toContain("y");
		expect(parent.textContent).toContain("z");
	});
});
