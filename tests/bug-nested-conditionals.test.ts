import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";
import { h, Fragment, $ } from "../src/js/ui/hyperscript.js";
import { render } from "../src/js/ui/client.js";

// Local mount helper (same pattern as other test files)
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

// Utility: collect element text content (skipping comment nodes)
const getElementTexts = (root) =>
	Array.from(root.childNodes)
		.filter((n: any) => n.nodeType === 1 || n.nodeType === 3)
		.map((n: any) => n.textContent)
		.filter((t) => t !== "");

const findFirstByNodeName = (root, name) => {
	let match;
	root.iterWalk?.((node) => {
		if (node.nodeName.toLowerCase() === name.toLowerCase()) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const findAllByNodeName = (root, name) => {
	const matches: any[] = [];
	root.iterWalk?.((node) => {
		if (node.nodeName.toLowerCase() === name.toLowerCase()) {
			matches.push(node);
		}
		return undefined;
	});
	return matches;
};

const findByText = (root, nodeName, text) => {
	let match;
	root.iterWalk?.((node) => {
		if (
			node.nodeName.toLowerCase() === nodeName.toLowerCase() &&
			node.textContent === text
		) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const findAllByText = (root, nodeName, text) => {
	const matches: any[] = [];
	root.iterWalk?.((node) => {
		if (
			node.nodeName.toLowerCase() === nodeName.toLowerCase() &&
			node.textContent === text
		) {
			matches.push(node);
		}
		return undefined;
	});
	return matches;
};

const hasText = (root, text) => {
	let found = false;
	root.iterWalk?.((node) => {
		if (node.textContent === text) {
			found = true;
			return false;
		}
		return undefined;
	});
	return found;
};

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

// Returns ordered element children (no comments/text) of a node
const elementChildren = (node) =>
	Array.from(node.childNodes).filter((n: any) => n.nodeType === 1);

describe("Bug 1: _uiPaths vs _uiEffects cache invalidation", () => {
	beforeEach(() => {
		domish.install();
	});

	test("branch switch invalidates _uiEffects on the cached node", () => {
		// If _uiPaths is used instead of _uiEffects, the cache is never
		// actually cleared, causing stale effect targets on re-render.
		const mode = $.cell("A");

		const App = () =>
			h.div(
				mode.match(
					(_) => _.case("A", h.span("Branch-A")),
					(_) => _.case("B", h.span("Branch-B")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		mode.set("A", true, derivedContext);

		expect(parent.textContent).toContain("Branch-A");

		// Switch to B
		mode.set("B", true, derivedContext);
		expect(parent.textContent).toContain("Branch-B");
		expect(parent.textContent).not.toContain("Branch-A");

		// Switch back to A -- this is where the bug manifests:
		// stale _uiEffects causes effects to target orphaned nodes
		mode.set("A", true, derivedContext);
		expect(parent.textContent).toContain("Branch-A");
		expect(parent.textContent).not.toContain("Branch-B");
	});

	test("nested conditional renders correctly after outer round-trip", () => {
		// Outer conditional hides/shows content containing an inner conditional.
		// With stale _uiEffects, the inner conditional targets orphaned DOM.
		const outer = $.cell(true);
		const inner = $.cell("X");

		const App = () =>
			h.div(
				outer.match(
					(_) =>
						_.case(
							true,
							h.div(
								inner.match(
									(_) => _.case("X", h.span("Inner-X")),
									(_) => _.case("Y", h.span("Inner-Y")),
								),
							),
						),
					(_) => _.else(h.span("Hidden")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		outer.set(true, true, derivedContext);
		inner.set("X", true, derivedContext);

		expect(parent.textContent).toContain("Inner-X");

		// Hide inner content
		outer.set(false, true, derivedContext);
		expect(parent.textContent).toContain("Hidden");
		expect(parent.textContent).not.toContain("Inner-X");

		// Show inner content again
		outer.set(true, true, derivedContext);
		expect(parent.textContent).toContain("Inner-X");
		expect(parent.textContent).not.toContain("Hidden");

		// Inner conditional should still work
		inner.set("Y", true, derivedContext);
		expect(parent.textContent).toContain("Inner-Y");
		expect(parent.textContent).not.toContain("Inner-X");
	});
});

describe("Bug 2: Fragment branches have no unrender cleanup", () => {
	beforeEach(() => {
		domish.install();
	});

	test("fragment children are removed when conditional switches away", () => {
		// DocumentFragment.parentNode is always null after children are
		// transferred to the DOM, so VNode.unrender's removeChild check
		// is a no-op for fragments. Children stay in the DOM.
		const mode = $.cell("frag");

		const App = () =>
			h.div(
				mode.match(
					(_) => _.case("frag", h(Fragment, null, h.span("F1"), h.span("F2"))),
					(_) => _.else(h.span("Other")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		mode.set("frag", true, derivedContext);

		const spans = findAllByNodeName(parent, "span");
		expect(spans.length).toBe(2);
		expect(spans[0].textContent).toBe("F1");
		expect(spans[1].textContent).toBe("F2");

		// Switch away from fragment branch
		mode.set("other", true, derivedContext);

		// Fragment children should be gone
		const afterSpans = findAllByNodeName(parent, "span");
		expect(afterSpans.length).toBe(1);
		expect(afterSpans[0].textContent).toBe("Other");
	});

	test("fragment branch does not double content on round-trip", () => {
		const mode = $.cell("frag");

		const App = () =>
			h.div(
				mode.match(
					(_) => _.case("frag", h(Fragment, null, h.span("F1"), h.span("F2"))),
					(_) => _.else(h.span("Other")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		mode.set("frag", true, derivedContext);

		expect(findAllByNodeName(parent, "span").length).toBe(2);

		// Switch away
		mode.set("other", true, derivedContext);

		// Switch back - should NOT double the content
		mode.set("frag", true, derivedContext);

		const spans = findAllByNodeName(parent, "span");
		expect(spans.length).toBe(2);
		expect(spans[0].textContent).toBe("F1");
		expect(spans[1].textContent).toBe("F2");
	});
});

describe("Bug 3: Stale nested effect state not cleared on unrender", () => {
	beforeEach(() => {
		domish.install();
	});

	test("inner conditional reflects updated value after outer round-trip", () => {
		// Outer switches away, inner's value changes externally, outer
		// switches back. Inner should show the new value, not the stale one.
		const outer = $.cell(true);
		const inner = $.cell("X");

		const App = () =>
			h.div(
				outer.match(
					(_) =>
						_.case(
							true,
							h.div(
								inner.match(
									(_) => _.case("X", h.span("Inner-X")),
									(_) => _.case("Y", h.span("Inner-Y")),
								),
							),
						),
					(_) => _.else(h.span("Outer-Off")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		outer.set(true, true, derivedContext);
		inner.set("X", true, derivedContext);

		expect(parent.textContent).toContain("Inner-X");

		// Hide inner content by switching outer
		outer.set(false, true, derivedContext);
		expect(parent.textContent).toContain("Outer-Off");

		// Change inner value while outer is hidden
		inner.set("Y", true, derivedContext);

		// Bring outer back - inner should reflect the new "Y" value
		outer.set(true, true, derivedContext);
		expect(parent.textContent).toContain("Inner-Y");
		expect(parent.textContent).not.toContain("Inner-X");
	});

	test("deeply nested conditional cleanup on outer re-show", () => {
		// Three levels of nesting: outer -> middle -> inner
		const outer = $.cell(true);
		const middle = $.cell("M1");
		const inner = $.cell("deep");

		const App = () =>
			h.div(
				outer.match(
					(_) =>
						_.case(
							true,
							h.div(
								middle.match(
									(_) =>
										_.case(
											"M1",
											h.div(
												inner.match(
													(_) => _.case("deep", h.span("DEEP")),
													(_) => _.else(h.span("SHALLOW")),
												),
											),
										),
									(_) => _.else(h.span("M2")),
								),
							),
						),
					(_) => _.else(h.span("OFF")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		outer.set(true, true, derivedContext);
		middle.set("M1", true, derivedContext);
		inner.set("deep", true, derivedContext);

		expect(parent.textContent).toContain("DEEP");

		// Switch outer off
		outer.set(false, true, derivedContext);
		expect(parent.textContent).toContain("OFF");

		// Change deep values while outer is hidden
		inner.set("shallow", true, derivedContext);
		middle.set("M2", true, derivedContext);

		// Bring outer back
		outer.set(true, true, derivedContext);
		// Middle was set to M2, so we expect M2 content
		expect(parent.textContent).toContain("M2");
		expect(parent.textContent).not.toContain("DEEP");
		expect(parent.textContent).not.toContain("SHALLOW");
	});
});

describe("Combined: nested conditionals with fragments and round-trips", () => {
	beforeEach(() => {
		domish.install();
	});

	test("nested conditional with fragment branch survives multiple round-trips", () => {
		const outer = $.cell("show");
		const inner = $.cell("A");

		const App = () =>
			h.div(
				outer.match(
					(_) =>
						_.case(
							"show",
							h.div(
								inner.match(
									(_) =>
										_.case("A", h(Fragment, null, h.span("A1"), h.span("A2"))),
									(_) =>
										_.case(
											"B",
											h(
												Fragment,
												null,
												h.span("B1"),
												h.span("B2"),
												h.span("B3"),
											),
										),
								),
							),
						),
					(_) => _.else(h.span("HIDDEN")),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		outer.set("show", true, derivedContext);
		inner.set("A", true, derivedContext);

		// Initial: Fragment A with 2 spans
		let spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["A1", "A2"]);

		// Switch inner to B
		inner.set("B", true, derivedContext);
		spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["B1", "B2", "B3"]);

		// Hide outer
		outer.set("hide", true, derivedContext);
		spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["HIDDEN"]);

		// Show outer again - should restore inner's last state (B)
		outer.set("show", true, derivedContext);
		spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["B1", "B2", "B3"]);

		// Switch inner back to A
		inner.set("A", true, derivedContext);
		spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["A1", "A2"]);

		// Another round-trip
		outer.set("hide", true, derivedContext);
		outer.set("show", true, derivedContext);
		spans = findAllByNodeName(parent, "span");
		expect(spans.map((s) => s.textContent)).toEqual(["A1", "A2"]);
	});
});

// =========================================================================
// LittleWiki-pattern tests
// =========================================================================

describe("LW1: Conditional toggle in mapped list preserves sibling order", () => {
	beforeEach(() => {
		domish.install();
	});

	test("toggling one mapped item's conditional does not displace siblings", () => {
		// Items rendered via .map() with a conditional inside.
		// Toggling the conditional on one item should not affect siblings.
		const items = $.cell(["First", "Second", "Third"]);
		const highlight = $.cell("");

		const App = () =>
			h.div(
				items.map((item) =>
					highlight.match(
						(_) => _.case((v) => v === item, h.span("*", item, "*")),
						(_) => _.else(h.p(item)),
					),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		items.set(["First", "Second", "Third"], true, derivedContext);
		highlight.set("", true, derivedContext);

		// Initial: three paragraphs
		const ps = findAllByNodeName(parent, "p");
		expect(ps.length).toBe(3);
		expect(ps[0].textContent).toBe("First");
		expect(ps[1].textContent).toBe("Second");
		expect(ps[2].textContent).toBe("Third");
	});

	test("toggling conditional in mapped list preserves sibling content", () => {
		// Simpler pattern: list of items, one has an isEdited toggle
		const isEdited = $.cell(false);

		const App = () =>
			h.div(
				h.section(
					isEdited.match(
						(_) => _.case(true, h.div("EDITOR")),
						(_) => _.else(h.h1("Title")),
					),
					h.p("Paragraph content"),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		isEdited.set(false, true, derivedContext);

		// Initial
		expect(findFirstByNodeName(parent, "h1")?.textContent).toBe("Title");
		expect(findFirstByNodeName(parent, "p")?.textContent).toBe(
			"Paragraph content",
		);

		// Toggle to edit
		isEdited.set(true, true, derivedContext);
		expect(findFirstByNodeName(parent, "h1")).toBeUndefined();
		expect(hasText(parent, "EDITOR")).toBeTrue();
		// Sibling paragraph must survive
		expect(findFirstByNodeName(parent, "p")?.textContent).toBe(
			"Paragraph content",
		);

		// Toggle back
		isEdited.set(false, true, derivedContext);
		expect(findFirstByNodeName(parent, "h1")?.textContent).toBe("Title");
		expect(findFirstByNodeName(parent, "p")?.textContent).toBe(
			"Paragraph content",
		);
	});
});

describe("LW2: Component whose template is a bare ConditionalEffect", () => {
	beforeEach(() => {
		domish.install();
	});

	test("component returning match() directly renders and round-trips", () => {
		// Mirrors TextoNode: function returns isEdited.match(...) directly,
		// not wrapped in a VNode container.
		const mode = $.cell("view");

		function ToggleView() {
			return mode.match(
				(_) => _.case("view", h.span("View Mode")),
				(_) => _.case("edit", h.div("Edit Mode")),
			);
		}

		const { parent, derivedContext } = mountWithHandle(ToggleView, {});
		mode.set("view", true, derivedContext);

		expect(hasText(parent, "View Mode")).toBeTrue();

		// Toggle to edit
		mode.set("edit", true, derivedContext);
		expect(hasText(parent, "Edit Mode")).toBeTrue();
		expect(hasText(parent, "View Mode")).toBeFalse();

		// Toggle back
		mode.set("view", true, derivedContext);
		expect(hasText(parent, "View Mode")).toBeTrue();
		expect(hasText(parent, "Edit Mode")).toBeFalse();
	});

	test("component returning nested match() round-trips correctly", () => {
		// Two levels: outer match wrapping an inner match, returned directly
		const isEdited = $.cell(false);
		const nodeType = $.cell("title");

		function NodeView() {
			const element = nodeType.match(
				(_) => _.case("title", h.h1("Title")).case("para", h.p("Paragraph")),
				(_) => _.else(h.div("Unknown")),
			);
			return isEdited.match(
				(_) => _.case(true, h.div("Editor")),
				(_) => _.else(element),
			);
		}

		const { parent, derivedContext } = mountWithHandle(NodeView, {});
		isEdited.set(false, true, derivedContext);
		nodeType.set("title", true, derivedContext);

		expect(hasText(parent, "Title")).toBeTrue();

		// Toggle to edit
		isEdited.set(true, true, derivedContext);
		expect(hasText(parent, "Editor")).toBeTrue();
		expect(hasText(parent, "Title")).toBeFalse();

		// Toggle back
		isEdited.set(false, true, derivedContext);
		expect(hasText(parent, "Title")).toBeTrue();
		expect(hasText(parent, "Editor")).toBeFalse();

		// Switch node type
		nodeType.set("para", true, derivedContext);
		expect(hasText(parent, "Paragraph")).toBeTrue();
		expect(hasText(parent, "Title")).toBeFalse();

		// Edit round-trip on paragraph
		isEdited.set(true, true, derivedContext);
		isEdited.set(false, true, derivedContext);
		expect(hasText(parent, "Paragraph")).toBeTrue();
	});
});

describe("LW3: Nested match-inside-else with fragment branch", () => {
	beforeEach(() => {
		domish.install();
	});

	test("type.match text fragment vs element name.match", () => {
		// Mirrors: type.match(_.case("text", <>{content}</>).else(name.match(...)))
		const type = $.cell("text");
		const name = $.cell("p");
		const content = $.cell("raw text");

		const App = () =>
			h.div(
				type.match(
					(_) => _.case("text", h(Fragment, null, content.text())),
					(_) =>
						_.else(
							name.match(
								(_) => _.case("p", h.p("paragraph")),
								(_) => _.case("h1", h.h1("heading")),
								(_) => _.else(h.div("unknown")),
							),
						),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		type.set("text", true, derivedContext);
		name.set("p", true, derivedContext);
		content.set("raw text", true, derivedContext);

		// Initial: text fragment
		expect(parent.textContent).toContain("raw text");
		expect(findAllByNodeName(parent, "p").length).toBe(0);

		// Switch to element type
		type.set("element", true, derivedContext);
		expect(parent.textContent).toContain("paragraph");
		expect(parent.textContent).not.toContain("raw text");

		// Switch name within element
		name.set("h1", true, derivedContext);
		expect(parent.textContent).toContain("heading");
		expect(parent.textContent).not.toContain("paragraph");

		// Switch back to text
		type.set("text", true, derivedContext);
		expect(parent.textContent).toContain("raw text");
		expect(parent.textContent).not.toContain("heading");

		// Round-trip text -> element -> text should not double content
		type.set("element", true, derivedContext);
		type.set("text", true, derivedContext);
		// Count text nodes to verify no doubling
		let textCount = 0;
		parent.iterWalk?.((node) => {
			if (node.nodeType === 3 && node.data === "raw text") {
				textCount++;
			}
			return undefined;
		});
		expect(textCount).toBe(1);
	});
});

describe("LW4: Full LittleWiki TextoNode pattern", () => {
	beforeEach(() => {
		domish.install();
	});

	test("recursive tree with edit toggle, cancel restores structure", () => {
		// Simplified reproduction of the full LittleWiki TextoNode pattern:
		// - Recursive component rendering a tree
		// - Each node has isEdited toggle
		// - Text nodes render as fragments
		// - Element nodes dispatch on name

		function Editor({ onClose }) {
			return h.div(
				{ class: "editor" },
				h.textarea(),
				h.button({ onClick: () => onClose.call() }, "Cancel"),
			);
		}

		function TreeNode({ node, isEdited }) {
			const { name, type, content } = $.get(node);
			const children = node
				.apply((_) => _.children)
				.map((child) => h(TreeNode, { node: child }));
			const onEdit = (event) => {
				isEdited.set(true);
				event.stopPropagation();
			};
			const editor = h(Editor, { onClose: () => isEdited.set(false) });
			const element = type.match(
				(_) => _.case("text", h(Fragment, null, content.text())),
				(_) =>
					_.else(
						name.match(
							(_) => _.case("content", h.div({ class: "content" }, children)),
							(_) => _.case("section", h.section(children)),
							(_) => _.case("title", h.h1({ onClick: onEdit }, children)),
							(_) => _.case("p", h.p({ onClick: onEdit }, children)),
							(_) => _.case("em", h.em(children)),
							(_) => _.else(h.div(children)),
						),
					),
			);
			return isEdited.match(
				(_) => _.case(true, editor),
				(_) => _.else(element),
			);
		}

		const data = {
			type: "element",
			name: "content",
			children: [
				{
					type: "element",
					name: "section",
					children: [
						{
							type: "element",
							name: "title",
							children: [
								{ type: "text", content: "Hello World", children: [] },
							],
						},
						{
							type: "element",
							name: "content",
							children: [
								{
									type: "element",
									name: "p",
									children: [
										{
											type: "text",
											content: "This is ",
											children: [],
										},
										{
											type: "element",
											name: "em",
											children: [
												{
													type: "text",
													content: "texto",
													children: [],
												},
											],
										},
										{
											type: "text",
											content: " document",
											children: [],
										},
									],
								},
							],
						},
					],
				},
			],
		};

		function Application() {
			return h.div(h(TreeNode, { node: data }));
		}

		const root = mountRoot();
		render(Application, {}, root);

		// Verify initial structure
		const title = findByText(root, "h1", "Hello World");
		expect(title).toBeDefined();
		expect(hasText(root, "This is ")).toBeTrue();
		expect(hasText(root, "texto")).toBeTrue();
		expect(hasText(root, " document")).toBeTrue();

		// Click the title to enter edit mode
		title.click();

		// Editor should appear
		const cancelBtn = findByText(root, "button", "Cancel");
		expect(cancelBtn).toBeDefined();

		// Paragraph content should still be visible
		expect(hasText(root, "This is ")).toBeTrue();
		expect(hasText(root, "texto")).toBeTrue();

		// Cancel the edit
		cancelBtn.click();

		// Title should be restored
		const titlesAfter = findAllByText(root, "h1", "Hello World");
		expect(titlesAfter.length).toBe(1);

		// Paragraph content should still be present
		expect(hasText(root, "This is ")).toBeTrue();
		expect(hasText(root, "texto")).toBeTrue();
		expect(hasText(root, " document")).toBeTrue();
	});
});

describe("LW5: Edit toggle on one tree node doesn't affect siblings", () => {
	beforeEach(() => {
		domish.install();
	});

	test("editing title preserves paragraph sibling throughout", () => {
		// A section with a title (editable) and paragraph (sibling).
		// Editing the title must not remove the paragraph.
		function Editor({ onClose }) {
			return h.div(
				{ class: "editor" },
				h.button({ onClick: () => onClose.call() }, "Cancel"),
			);
		}

		function TreeNode({ node, isEdited }) {
			const { name, type, content } = $.get(node);
			const children = node
				.apply((_) => _.children)
				.map((child) => h(TreeNode, { node: child }));
			const onEdit = (event) => {
				isEdited.set(true);
				event.stopPropagation();
			};
			const editor = h(Editor, { onClose: () => isEdited.set(false) });
			const element = type.match(
				(_) => _.case("text", h(Fragment, null, content.text())),
				(_) =>
					_.else(
						name.match(
							(_) => _.case("content", h.div({ class: "content" }, children)),
							(_) => _.case("section", h.section(children)),
							(_) => _.case("title", h.h1({ onClick: onEdit }, children)),
							(_) => _.case("p", h.p({ onClick: onEdit }, children)),
							(_) => _.case("em", h.em(children)),
							(_) => _.else(h.div(children)),
						),
					),
			);
			return isEdited.match(
				(_) => _.case(true, editor),
				(_) => _.else(element),
			);
		}

		const data = {
			type: "element",
			name: "section",
			children: [
				{
					type: "element",
					name: "title",
					children: [{ type: "text", content: "My Title", children: [] }],
				},
				{
					type: "element",
					name: "p",
					children: [{ type: "text", content: "My paragraph", children: [] }],
				},
			],
		};

		function Application() {
			return h.div(h(TreeNode, { node: data }));
		}

		const root = mountRoot();
		render(Application, {}, root);

		// Both present initially
		expect(hasText(root, "My Title")).toBeTrue();
		expect(hasText(root, "My paragraph")).toBeTrue();

		// Click title to edit
		const title = findByText(root, "h1", "My Title");
		expect(title).toBeDefined();
		title.click();

		// Editor appears, paragraph is still there
		expect(findByText(root, "button", "Cancel")).toBeDefined();
		expect(hasText(root, "My paragraph")).toBeTrue();

		// Cancel
		findByText(root, "button", "Cancel").click();

		// Both restored
		expect(hasText(root, "My Title")).toBeTrue();
		expect(hasText(root, "My paragraph")).toBeTrue();

		// Only one h1 (no duplication)
		expect(findAllByText(root, "h1", "My Title").length).toBe(1);
	});
});

describe("LW6: Position preserved after edit round-trip in mapped items", () => {
	beforeEach(() => {
		domish.install();
	});

	test("title appears before content after edit cancel in section", () => {
		// Mirrors the exact DOM ordering bug: after edit round-trip on
		// the title, it should remain BEFORE the content div in the section.
		function Editor({ onClose }) {
			return h.div(
				{ class: "editor" },
				h.button({ onClick: () => onClose.call() }, "Cancel"),
			);
		}

		function TreeNode({ node, isEdited }) {
			const { name, type, content } = $.get(node);
			const children = node
				.apply((_) => _.children)
				.map((child) => h(TreeNode, { node: child }));
			const onEdit = (event) => {
				isEdited.set(true);
				event.stopPropagation();
			};
			const editor = h(Editor, { onClose: () => isEdited.set(false) });
			const element = type.match(
				(_) => _.case("text", h(Fragment, null, content.text())),
				(_) =>
					_.else(
						name.match(
							(_) => _.case("content", h.div({ class: "content" }, children)),
							(_) => _.case("section", h.section(children)),
							(_) => _.case("title", h.h1({ onClick: onEdit }, children)),
							(_) => _.case("p", h.p({ onClick: onEdit }, children)),
							(_) => _.case("em", h.em(children)),
							(_) => _.else(h.div(children)),
						),
					),
			);
			return isEdited.match(
				(_) => _.case(true, editor),
				(_) => _.else(element),
			);
		}

		const data = {
			type: "element",
			name: "content",
			children: [
				{
					type: "element",
					name: "section",
					children: [
						{
							type: "element",
							name: "title",
							children: [
								{ type: "text", content: "Hello World", children: [] },
							],
						},
						{
							type: "element",
							name: "content",
							children: [
								{
									type: "element",
									name: "p",
									children: [
										{ type: "text", content: "paragraph", children: [] },
									],
								},
							],
						},
					],
				},
			],
		};

		function Application() {
			return h.div(h(TreeNode, { node: data }));
		}

		const root = mountRoot();
		render(Application, {}, root);

		// Find the section and verify initial order
		const section = findFirstByNodeName(root, "section");
		expect(section).toBeDefined();

		const initialChildren = elementChildren(section);
		expect(initialChildren.length).toBe(2);
		expect(initialChildren[0].nodeName.toLowerCase()).toBe("h1");
		expect(initialChildren[1].nodeName.toLowerCase()).toBe("div");

		// Click title to edit
		const title = findByText(root, "h1", "Hello World");
		title.click();

		// Cancel
		const cancelBtn = findByText(root, "button", "Cancel");
		cancelBtn.click();

		// Verify DOM order is preserved: h1 must come before div
		const afterChildren = elementChildren(section);
		expect(afterChildren.length).toBe(2);
		expect(afterChildren[0].nodeName.toLowerCase()).toBe("h1");
		expect(afterChildren[1].nodeName.toLowerCase()).toBe("div");
		expect(afterChildren[0].textContent).toBe("Hello World");
	});
});
