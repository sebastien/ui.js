import { beforeEach, describe, expect, test } from "bun:test";
import { $, Fragment, h } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));

const buildTree = (mode = "initial") => ({
	id: 1,
	type: "element",
	name: "content",
	children: [
		{
			id: 2,
			type: "element",
			name: "list",
			children: [
				{
					id: 3,
					type: "element",
					name: "item",
					children: [{ id: 4, type: "text", content: "A", children: [] }],
				},
				mode === "initial"
					? {
							id: 5,
							type: "element",
							name: "item",
							children: [
								{ id: 6, type: "text", content: "Easy to use", children: [] },
							],
						}
					: {
							id: 5,
							type: "element",
							name: "item",
							children: [
								{ id: 6, type: "text", content: "Easy to use ", children: [] },
								{
									id: 7,
									type: "element",
									name: "em",
									children: [
										{ id: 8, type: "text", content: "term", children: [] },
									],
								},
							],
						},
			],
		},
	],
});

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

const directTextNodes = (node) =>
	(node?.childNodes || []).filter((child) => child.nodeType === Node.TEXT_NODE);

describe("bug replica emphasis tail duplication", () => {
	beforeEach(() => {
		installDom();
	});

	test("repeated render after text->text+em transition does not append stale tail", () => {
		const tree = $.cell(buildTree("initial"));

		function NodeView({ node }) {
			const { type, name, content } = $.get(node);
			const children = node
				.apply((current) => current?.children || [])
				.map(
					(child) => h(NodeView, { node: child }),
					(item) => item?.id,
				);
			return type.match((_) =>
				_.case("text", h(Fragment, null, content)).else(
					name.match((_) =>
						_.case("content", h.article(children))
							.case("list", h.ul(children))
							.case("item", h.li(children))
							.case("em", h.em(children))
							.else(h.div(children)),
					),
				),
			);
		}

		const App = () => h.div(h(NodeView, { node: tree }));
		const { parent, derivedContext } = mountWithHandle(App, {});

		const updated = buildTree("updated");
		tree.set(updated, true, derivedContext);
		// Trigger another render with equivalent content to ensure
		// comment-anchor text updates don't append stale tails.
		tree.set(clone(updated), true, derivedContext);

		const item = findNode(
			parent,
			(node) =>
				node.nodeName.toLowerCase() === "li" &&
				node.textContent?.includes("Easy to use"),
		);
		expect(item).toBeDefined();
		expect(item.textContent).toBe("Easy to use term");

		const em = findNode(
			item,
			(node) => node.nodeName?.toLowerCase?.() === "em",
		);
		expect(em).toBeDefined();
		expect(em.textContent).toBe("term");

		const texts = directTextNodes(item)
			.map((_) => _.data)
			.filter((_) => _.trim().length > 0);
		expect(texts).toEqual(["Easy to use "]);
	});
});
