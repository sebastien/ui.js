import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { $, h, Fragment } from "../src/js/ui/hyperscript.js";

// -------------------------------------------------------------------
// DOM helpers
// -------------------------------------------------------------------
const walk = (root, predicate) => {
	const out = [];
	root.iterWalk((node) => {
		if (predicate(node)) out.push(node);
		return undefined;
	});
	return out;
};

const findList = (root, marker) =>
	walk(
		root,
		(n) =>
			n.nodeName?.toLowerCase?.() === "ul" &&
			(n.getAttribute?.("class") || "").includes("TextoBlock") &&
			(n.textContent || "").includes(marker),
	)[0];

const findButton = (root, label) =>
	walk(
		root,
		(n) => n.nodeName?.toLowerCase?.() === "button" && n.textContent === label,
	)[0];

const listItemTexts = (list) =>
	(list?.childNodes || [])
		.filter((n) => n.nodeName?.toLowerCase?.() === "li")
		.map((n) => (n.textContent || "").trim());

// -------------------------------------------------------------------
// AST builder — uses Map for attributes like real TextoParser output.
// Returns fresh objects on every call (simulates full re-parse).
// -------------------------------------------------------------------
const attrs = (entries) => {
	const m = new Map();
	for (const [k, v] of entries) m.set(k, v);
	return m;
};

const makeAST = () => ({
	type: "element",
	name: "content",
	position: { start: 0, end: 500 },
	attributes: attrs([
		["block", "container"],
		["level", "0"],
	]),
	children: [
		{
			type: "element",
			name: "p",
			position: { start: 0, end: 50 },
			attributes: attrs([
				["block", "block"],
				["level", "0"],
			]),
			children: [
				{
					type: "text",
					content: "Intro paragraph",
					children: [],
					attributes: new Map(),
				},
			],
		},
		{
			type: "element",
			name: "list",
			position: { start: 51, end: 200 },
			attributes: attrs([
				["block", "block"],
				["level", "0"],
			]),
			children: [
				{
					type: "element",
					name: "item",
					position: { start: 52, end: 80 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "Vision goals",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 81, end: 120 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "Prioritize",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 121, end: 160 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "Manage backlog",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 161, end: 200 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "Share progress",
							children: [],
							attributes: new Map(),
						},
					],
				},
			],
		},
		{
			type: "element",
			name: "p",
			position: { start: 201, end: 250 },
			attributes: attrs([
				["block", "block"],
				["level", "0"],
			]),
			children: [
				{
					type: "text",
					content: "Middle paragraph",
					children: [],
					attributes: new Map(),
				},
			],
		},
		{
			type: "element",
			name: "list",
			position: { start: 251, end: 450 },
			attributes: attrs([
				["block", "block"],
				["level", "0"],
			]),
			children: [
				{
					type: "element",
					name: "item",
					position: { start: 252, end: 300 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "PO defines vision",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 301, end: 350 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "PO works with stakeholders",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 351, end: 400 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "PO manages backlog",
							children: [],
							attributes: new Map(),
						},
					],
				},
				{
					type: "element",
					name: "item",
					position: { start: 401, end: 450 },
					attributes: new Map(),
					children: [
						{
							type: "text",
							content: "Overall PO plays crucial role",
							children: [],
							attributes: new Map(),
						},
					],
				},
			],
		},
		{
			type: "element",
			name: "p",
			position: { start: 451, end: 500 },
			attributes: attrs([
				["block", "block"],
				["level", "0"],
			]),
			children: [
				{
					type: "text",
					content: "Final paragraph",
					children: [],
					attributes: new Map(),
				},
			],
		},
	],
});

// -------------------------------------------------------------------
// Components — mirrors Texto.jsx TextoNode / TextoEditor structure
// exactly, including the blockType.match conditional
// -------------------------------------------------------------------

function WikiEditor({ onClose }) {
	const onSave = (event) => {
		// Real code: $.send dispatches a custom DOM event that bubbles up
		// to an ancestor onTextoEdit handler, which calls source.set().
		// Then closeEditor calls onClose (isEdited.set(false)).
		$.send("TextoEdit", { kind: "texto-edit" });
		onClose.call();
		event?.stopPropagation?.();
	};
	const onCancel = (event) => {
		onClose.call();
		event?.stopPropagation?.();
	};
	// Real TextoEditor returns a Fragment with two siblings:
	// 1. A fixed overlay div (click = save)
	// 2. The editor div
	return h(
		Fragment,
		null,
		h.div({ class: "fix cover", onClick: onSave }),
		h.div(
			{ class: "WikiEditor", onClick: $.swallow },
			h.button({ onClick: onSave }, "Save"),
			h.button({ onClick: onCancel }, "Cancel"),
		),
	);
}

// Recursive node renderer — matches Texto.jsx TextoNode exactly
function TextoNode({ node, source }) {
	const isEdited = $.cell(false);
	const { name, type, content, attributes } = $.get(node);
	const blockType = attributes.apply((_) => _?.get("block"));
	const position = node.apply((current) =>
		current?.position
			? `${current.position.start}-${current.position.end}`
			: null,
	);
	const children = node
		.apply((_) => _?.children || [])
		.map(
			(child) => h(TextoNode, { node: child, source }),
			(current, index) =>
				current?.id ??
				`${current?.position?.start ?? "?"}-${current?.position?.end ?? "?"}:${index}`,
		);
	const onEdit = (event) => {
		isEdited.set(true);
		event.stopPropagation?.();
	};
	const onClose = () => isEdited.set(false);
	const editor = h(WikiEditor, { onClose });

	// createBlock matches the real code: blockType.match wraps the element
	const createBlock = (tag) =>
		blockType.match((_) =>
			_.case(
				"block",
				h[tag](
					{
						class: "TextoBlock",
						"data-pos": position,
						onClick: onEdit,
						tabindex: "0",
					},
					children,
				),
			).else(h[tag]({ "data-pos": position }, children)),
		);

	const element = type.match((_) =>
		_.case("text", h(Fragment, null, content)).else(
			name.match((_) =>
				_.case("content", h.article({ "data-pos": position }, children))
					.case("list", createBlock("ul"))
					.case("p", createBlock("p"))
					.case("item", h.li({ "data-pos": position }, children))
					.else(h.div(children)),
			),
		),
	);
	return isEdited.match((_) => _.case(true, editor).else(element));
}

let _refreshCount = 0;
let _rootSignal;
function App() {
	const source = $.signal("dummy text");
	// Use a signal for root AST, so updates are synchronous (no microtask)
	const root = $.signal(makeAST());
	_rootSignal = root;
	const refreshSource = () => {
		_refreshCount++;
		// Directly set a new AST (synchronous notification, no derived cell delay)
		root.set(makeAST());
	};
	// Like real TextoDocument: onTextoEdit handler on ancestor catches $.send("TextoEdit")
	return h.div(
		{ onTextoEdit: refreshSource },
		h(TextoNode, { node: root, source }),
	);
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("bug: nested mapping last-item duplication after conditional toggle", () => {
	beforeEach(() => {
		domish.install();
		_refreshCount = 0;
	});

	test("edit bottom list then top list: bottom list items stay distinct", async () => {
		const root = document.createElement("div");
		document.body.appendChild(root);
		render(App, {}, root);
		await flush();

		const expectedBottom = [
			"PO defines vision",
			"PO works with stakeholders",
			"PO manages backlog",
			"Overall PO plays crucial role",
		];
		const expectedTop = [
			"Vision goals",
			"Prioritize",
			"Manage backlog",
			"Share progress",
		];

		// Verify initial render
		let bottomList = findList(root, "Overall PO plays crucial role");
		expect(bottomList).toBeDefined();
		expect(listItemTexts(bottomList)).toEqual(expectedBottom);

		let topList = findList(root, "Vision goals");
		expect(topList).toBeDefined();
		expect(listItemTexts(topList)).toEqual(expectedTop);

		// Cycle 1: click bottom list → editor → save
		bottomList.click();
		await flush();
		let save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();
		expect(_refreshCount).toBe(1);

		// Cycle 2: click top list → editor → save
		topList = findList(root, "Vision goals");
		expect(topList).toBeDefined();
		topList.click();
		await flush();
		save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();
		expect(_refreshCount).toBe(2);

		// Cycle 3: click bottom list → editor → save (matches Playwright test's 3rd cycle)
		bottomList = findList(root, "PO defines vision");
		expect(bottomList).toBeDefined();
		bottomList.click();
		await flush();
		save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();
		expect(_refreshCount).toBe(3);

		// THE BUG: top list collapses — all items become the last item
		topList = findList(root, "Vision");
		expect(topList).toBeDefined();
		expect(listItemTexts(topList)).toEqual(expectedTop);

		// Also verify bottom list
		bottomList = findList(root, "PO");
		expect(bottomList).toBeDefined();
		expect(listItemTexts(bottomList)).toEqual(expectedBottom);
	});

	test("edit top list then bottom list then top: bottom list stays distinct", async () => {
		const root = document.createElement("div");
		document.body.appendChild(root);
		render(App, {}, root);
		await flush();

		const expectedTop = [
			"Vision goals",
			"Prioritize",
			"Manage backlog",
			"Share progress",
		];
		const expectedBottom = [
			"PO defines vision",
			"PO works with stakeholders",
			"PO manages backlog",
			"Overall PO plays crucial role",
		];

		// Cycle 1: edit top
		let topList = findList(root, "Vision goals");
		expect(topList).toBeDefined();
		topList.click();
		await flush();
		let save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();

		// Cycle 2: edit bottom
		let bottomList = findList(root, "Overall PO plays crucial role");
		expect(bottomList).toBeDefined();
		bottomList.click();
		await flush();
		save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();

		// Cycle 3: edit top again
		topList = findList(root, "Vision goals");
		expect(topList).toBeDefined();
		topList.click();
		await flush();
		save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();
		await flush();

		// Verify both lists are still correct
		bottomList = findList(root, "PO");
		expect(bottomList).toBeDefined();
		expect(listItemTexts(bottomList)).toEqual(expectedBottom);

		topList = findList(root, "Vision");
		expect(topList).toBeDefined();
		expect(listItemTexts(topList)).toEqual(expectedTop);
	});
});
