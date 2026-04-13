import { beforeEach, describe, expect, test } from "bun:test";
import { render } from "../src/js/ui/client.js";
import { h, $, Fragment } from "../src/js/ui/hyperscript.js";
import { installDom, mountRoot } from "./test-utils.ts";

const findNode = (root, predicate) => {
	let match;
	root.iterWalk((node) => {
		if (predicate(node)) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const findByDataPos = (root, tag, dataPos) =>
	findNode(
		root,
		(node) =>
			node.nodeName.toLowerCase() === tag.toLowerCase() &&
			node.getAttribute?.("data-pos") === dataPos,
	);

const findButton = (root, text) =>
	findNode(
		root,
		(node) =>
			node.nodeName.toLowerCase() === "button" && node.textContent === text,
	);

const countByDataPos = (root, tag, dataPos) => {
	let count = 0;
	root.iterWalk((node) => {
		if (
			node.nodeName.toLowerCase() === tag.toLowerCase() &&
			node.getAttribute?.("data-pos") === dataPos
		) {
			count += 1;
		}
		return undefined;
	});
	return count;
};

const elementChildren = (node) =>
	(node?.childNodes || []).filter(
		(child) => child.nodeType === Node.ELEMENT_NODE,
	);

const createApplication = () => {
	const tree = {
		type: "element",
		name: "content",
		position: { start: 0, end: 217 },
		children: [
			{
				type: "element",
				name: "section",
				position: { start: 1, end: 217 },
				children: [
					{
						type: "element",
						name: "title",
						position: { start: 3, end: 14 },
						children: [{ type: "text", content: "Hello World", children: [] }],
					},
					{
						type: "element",
						name: "content",
						position: { start: 15, end: 217 },
						children: [
							{
								type: "element",
								name: "p",
								position: { start: 16, end: 43 },
								children: [
									{ type: "text", content: "This is a ", children: [] },
									{
										type: "element",
										name: "em",
										position: { start: 26, end: 33 },
										children: [
											{ type: "text", content: "texto", children: [] },
										],
									},
									{ type: "text", content: " document", children: [] },
								],
							},
							{
								type: "element",
								name: "list",
								position: { start: 44, end: 112 },
								children: [
									{
										type: "element",
										name: "item",
										position: { start: 44, end: 82 },
										children: [
											{
												type: "text",
												content: "It supports **markdown-like** syntax",
												children: [],
											},
										],
									},
									{
										type: "element",
										name: "item",
										position: { start: 83, end: 111 },
										children: [
											{
												type: "text",
												content: "It can be edited in-place",
												children: [],
											},
										],
									},
								],
							},
							{
								type: "element",
								name: "section",
								position: { start: 112, end: 217 },
								children: [
									{
										type: "element",
										name: "title",
										position: { start: 115, end: 123 },
										children: [
											{ type: "text", content: "Features", children: [] },
										],
									},
								],
							},
						],
					},
				],
			},
		],
	};

	const WikiEditor = ({ onClose }) =>
		h.div(
			{ class: "WikiEditor", onClick: (event) => event.stopPropagation?.() },
			h.button(
				{
					onClick: (event) => {
						event.stopPropagation?.();
						onClose.call();
					},
				},
				"Cancel",
			),
		);

	function TextoNode({ node }) {
		const isEdited = $.cell(false);
		const { name, type, content } = $.get(node);
		const position = node.apply(
			({ position }) => `${position.start}-${position.end}`,
		);
		const children = node
			.apply((_) => _?.children)
			.map((child) => h(TextoNode, { node: child }));
		const onEdit = (event) => {
			isEdited.set(true);
			event?.stopPropagation?.();
		};
		const createBlock = (tag) =>
			h[tag](
				{
					class: "TextoBlock",
					onClick: onEdit,
					"data-pos": position,
					tabindex: "0",
				},
				children,
			);
		const editor = h(WikiEditor, { onClose: () => isEdited.set(false) });
		const element = type.match((_) =>
			_.case("text", h(Fragment, null, content)).else(
				name.match((_) =>
					_.case("content", createBlock("article"))
						.case("section", h.section({ "data-pos": position }, children))
						.case("title", createBlock("h1"))
						.case("list", createBlock("ul"))
						.case("item", h.li({ "data-pos": position }, children))
						.case("em", h.em({ "data-pos": position }, children))
						.case("p", h.p({ "data-pos": position }, children))
						.else(h.div("Unknown")),
				),
			),
		);
		return isEdited.match((_) => _.case(true, editor).else(element));
	}

	return function Application() {
		return h.div({ class: "t p-6" }, h(TextoNode, { node: tree }));
	};
};

describe("littlewiki list cancel reorder", () => {
	beforeEach(() => {
		installDom();
	});

	const expectSiblingOrderStable = (root) => {
		const cancelButton = findButton(root, "Cancel");
		expect(cancelButton).toBeDefined();
		cancelButton.click();

		const contentAfter = findByDataPos(root, "article", "15-217");
		expect(contentAfter).toBeDefined();
		const afterOrder = elementChildren(contentAfter).map(
			(node) =>
				`${node.nodeName.toLowerCase()}:${node.getAttribute?.("data-pos")}`,
		);
		expect(afterOrder).toEqual(["p:16-43", "ul:44-112", "section:112-217"]);
		expect(countByDataPos(root, "ul", "44-112")).toBe(1);
	};

	test("canceling list editor keeps list in original sibling slot", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);
		const content = findByDataPos(root, "article", "15-217");
		expect(content).toBeDefined();
		const initialOrder = elementChildren(content).map(
			(node) =>
				`${node.nodeName.toLowerCase()}:${node.getAttribute?.("data-pos")}`,
		);
		expect(initialOrder).toEqual(["p:16-43", "ul:44-112", "section:112-217"]);

		const list = findByDataPos(root, "ul", "44-112");
		expect(list).toBeDefined();
		list.click();

		expectSiblingOrderStable(root);
	});

	test("cancel after clicking first list item preserves sibling order", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);
		const content = findByDataPos(root, "article", "15-217");
		expect(content).toBeDefined();
		const initialOrder = elementChildren(content).map(
			(node) =>
				`${node.nodeName.toLowerCase()}:${node.getAttribute?.("data-pos")}`,
		);
		expect(initialOrder).toEqual(["p:16-43", "ul:44-112", "section:112-217"]);

		const firstListItem = findByDataPos(root, "li", "44-82");
		expect(firstListItem).toBeDefined();
		firstListItem.click();

		expectSiblingOrderStable(root);
	});
});
