import { beforeEach, describe, expect, test } from "bun:test";
import { h, $, Fragment } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

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

const findListItems = (root) => {
	const list = findNode(root, (node) => node.nodeName.toLowerCase() === "ul");
	if (!list) {
		return [];
	}
	return (list.childNodes || []).filter(
		(node) => node.nodeName?.toLowerCase?.() === "li",
	);
};

const nonEmptyDirectTextNodes = (node) =>
	(node?.childNodes || []).filter(
		(child) =>
			child.nodeType === Node.TEXT_NODE &&
			typeof child.data === "string" &&
			child.data.trim().length > 0,
	);

const paragraphChildren = (node) =>
	(node?.childNodes || []).filter(
		(child) =>
			child.nodeType === Node.ELEMENT_NODE &&
			child.nodeName.toLowerCase() === "p",
	);

const buildTree = (mode) => ({
	type: "element",
	name: "content",
	position: { start: 0, end: 224 },
	children: [
		{
			type: "element",
			name: "section",
			position: { start: 0, end: 224 },
			children: [
				{
					type: "element",
					name: "content",
					position: { start: 15, end: 224 },
					children: [
						{
							type: "element",
							name: "list",
							position: { start: 44, end: 119 },
							children: [
								{
									type: "element",
									name: "item",
									position: { start: 44, end: 82 },
									children: [{ type: "text", content: "A", children: [] }],
								},
								mode === "initial"
									? {
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
										}
									: {
											type: "element",
											name: "item",
											position: {
												start: 0,
												end: mode === "paragraph" ? 112 : 110,
											},
											children: [
												{
													type: "element",
													name: "p",
													position: { start: 85, end: 110 },
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
								...(mode === "with-third"
									? [
											{
												type: "element",
												name: "item",
												position: { start: 0, end: 118 },
												children: [
													{
														type: "element",
														name: "p",
														position: { start: 0, end: 4 },
														children: [
															{ type: "text", content: "XXX", children: [] },
														],
													},
												],
											},
										]
									: []),
							],
						},
					],
				},
			],
		},
	],
});

describe("littlewiki tree update text/paragraph duplication", () => {
	beforeEach(() => {
		installDom();
	});

	test("tree updates from text item to paragraph item without stale text", () => {
		const tree = $.cell(buildTree("initial"));

		function NodeView({ node }) {
			const { name, type, content } = $.get(node);
			const children = node
				.apply((current) => current?.children || [])
				.map((child) => h(NodeView, { node: child }));
			return type.match((_) =>
				_.case("text", h(Fragment, null, content)).else(
					name.match((_) =>
						_.case("content", h.article(children))
							.case("section", h.section(children))
							.case("list", h.ul(children))
							.case("item", h.li(children))
							.case("p", h.p(children))
							.else(h.div(children)),
					),
				),
			);
		}

		const App = () => h.div(h(NodeView, { node: tree }));
		const { parent, derivedContext } = mountWithHandle(App, {});

		tree.set(buildTree("paragraph"), true, derivedContext);
		const second = findListItems(parent)[1];
		expect(second).toBeDefined();
		expect(nonEmptyDirectTextNodes(second).length).toBe(0);
		expect(paragraphChildren(second).length).toBe(1);
		expect(second?.textContent).toBe("It can be edited in-place");

		tree.set(buildTree("with-third"), true, derivedContext);
		const secondAgain = findListItems(parent)[1];
		const third = findListItems(parent)[2];
		expect(secondAgain).toBeDefined();
		expect(third).toBeDefined();
		expect(nonEmptyDirectTextNodes(secondAgain).length).toBe(0);
		expect(paragraphChildren(secondAgain).length).toBe(1);
		expect(secondAgain?.textContent).toBe("It can be edited in-place");
		expect(nonEmptyDirectTextNodes(third).length).toBe(0);
		expect(paragraphChildren(third).length).toBe(1);
		expect(third?.textContent).toBe("XXX");
	});
});
