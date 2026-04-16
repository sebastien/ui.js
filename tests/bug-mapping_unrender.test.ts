import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { Slot } from "../src/js/ui/cells.js";
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
		const { parent, effect, effector, ctx } = mountWithHandle(App, {
			list: ["a", "b", "c"],
		});

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

		// Unrender the entire component
		effect.unrender(ctx, effector);

		// After unrender, walk the context checking for stale node
		// references -- DOM nodes that survived unrender but are
		// now parentless (detached). The MappingEffect's direct
		// unsubrender call (bypassing super.unrender) may leave its
		// own Slot.Node cache intact.
		let staleNodeRefs = 0;
		for (let i = 0; i < 500; i += 6) {
			const nodeRef = ctx[i + Slot.Node];
			if (nodeRef && typeof nodeRef === "object" && "nodeType" in nodeRef) {
				if (!nodeRef.parentNode) {
					staleNodeRefs++;
				}
			}
		}

		// Ideally zero stale node references after complete unrender
		expect(staleNodeRefs).toBe(0);
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
