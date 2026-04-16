import { beforeEach, describe, expect, test } from "bun:test";
import { $, Fragment, h } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

// --
// Exercises a double-rendering bug in nested MappingEffects.
//
// When a keyed MappingEffect updates an existing item, it both:
//   1. Calls `valueSlot.set()` which triggers a synchronous subscription cascade
//   2. Calls `template.render()` which re-renders the VNode template
//
// For nested MappingEffects, step (1) propagates to the inner mapping, which
// renders new children (e.g. inserting an `<em>` before the comment anchor).
// Then step (2) re-triggers the inner mapping's render, calling `ensureText`
// on a comment anchor whose `previousSibling` is now the newly inserted `<em>`
// instead of the owned text node — resulting in a duplicate text node.
//
// This test reproduces the exact scenario: an outer mapping over list items
// contains an inner mapping over inline children. When an item's children
// change from [text] to [text, em], the text should appear exactly once.

const findNode = (root, predicate) => {
	let match;
	root.iterWalk?.((node) => {
		if (predicate(node)) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const directTextNodes = (node) =>
	(node?.childNodes || []).filter((child) => child.nodeType === Node.TEXT_NODE);

describe("bug: nested mapping double render causes text duplication", () => {
	beforeEach(() => {
		installDom();
	});

	test("adding a sibling element to a text node does not duplicate the text", () => {
		// Simulates a simplified AST: a list with one item containing inline children.
		// The inline children change from [text] to [text, em].
		const items = $.cell([
			{
				id: 1,
				children: [{ id: 10, type: "text", value: "Easy to use" }],
			},
		]);

		// Inner component: renders each inline child.
		// "text" type → renders the value string (via Application + ensureText on comment anchor)
		// "em" type → renders an <em> element with text content
		function InlineNode({ node }) {
			const { type, value } = $.get(node);
			const children = node
				.apply((_) => _?.children || [])
				.map(
					(child) => h(InlineNode, { node: child }),
					(v) => v?.id,
				);
			return type.match((_) =>
				_.case("text", value).case("em", h.em(children)).else(h.span(children)),
			);
		}

		// Outer component: maps over items, each rendering a <li> with mapped inline children.
		// This creates the nested MappingEffect structure that triggers the bug.
		function ItemNode({ node }) {
			const children = node
				.apply((_) => _?.children || [])
				.map(
					(child) => h(InlineNode, { node: child }),
					(v) => v?.id,
				);
			return h.li(children);
		}

		const App = () =>
			h.ul(
				items.map(
					(item) => h(ItemNode, { node: item }),
					(v) => v?.id,
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});

		// Verify initial state
		const liBefore = findNode(
			parent,
			(n) => n.nodeName?.toLowerCase?.() === "li",
		);
		expect(liBefore).toBeDefined();
		expect(liBefore.textContent).toBe("Easy to use");

		// Update: item's children change from [text] to [text, em]
		// This is a single update — no artificial double-set needed.
		items.set(
			[
				{
					id: 1,
					children: [
						{ id: 10, type: "text", value: "Easy to use " },
						{
							id: 20,
							type: "em",
							children: [{ id: 30, type: "text", value: "term" }],
						},
					],
				},
			],
			true,
			derivedContext,
		);

		// Verify: text "Easy to use " should appear exactly once
		const li = findNode(parent, (n) => n.nodeName?.toLowerCase?.() === "li");
		expect(li).toBeDefined();
		expect(li.textContent).toBe("Easy to use term");

		const em = findNode(li, (n) => n.nodeName?.toLowerCase?.() === "em");
		expect(em).toBeDefined();
		expect(em.textContent).toBe("term");

		// The key assertion: only one non-empty text node directly under <li>
		const textNodes = directTextNodes(li)
			.map((n) => n.data)
			.filter((d) => d.trim().length > 0);
		expect(textNodes).toEqual(["Easy to use "]);
	});
});
