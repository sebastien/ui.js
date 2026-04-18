import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { $, h } from "../src/js/ui/hyperscript.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

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

const findList = (root, marker) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "ul" &&
			(node.textContent || "").includes(marker),
	);

const findButton = (root, label) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "button" && node.textContent === label,
	);

const listTexts = (root, marker) => {
	const list = findList(root, marker);
	if (!list) {
		return [];
	}
	return (list.childNodes || [])
		.filter((node) => node.nodeName?.toLowerCase?.() === "li")
		.map((node) => node.textContent?.trim?.() ?? "");
};

const makeDoc = () => ({
	type: "element",
	name: "content",
	id: 1,
	children: [
		{
			type: "element",
			name: "list",
			id: 2,
			children: [
				{
					type: "element",
					name: "item",
					id: 21,
					children: [
						{
							type: "text",
							id: 211,
							content: "Vision, goals & priorities",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 22,
					children: [
						{
							type: "text",
							id: 221,
							content: "Prioritize capabilities",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 23,
					children: [
						{ type: "text", id: 231, content: "Manage backlog", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 24,
					children: [
						{
							type: "text",
							id: 241,
							content: "Relay stakeholder voice",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 25,
					children: [
						{ type: "text", id: 251, content: "Introduce KPIs", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 26,
					children: [
						{ type: "text", id: 261, content: "Share progress", children: [] },
					],
				},
			],
		},
		{
			type: "element",
			name: "list",
			id: 3,
			children: [
				{
					type: "element",
					name: "item",
					id: 31,
					children: [
						{
							type: "text",
							id: 311,
							content: "The product owner is responsible",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 32,
					children: [
						{ type: "text", id: 321, content: "Align strategy", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 33,
					children: [
						{ type: "text", id: 331, content: "Plan roadmap", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 34,
					children: [
						{ type: "text", id: 341, content: "Review risks", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 35,
					children: [
						{ type: "text", id: 351, content: "Confirm rollout", children: [] },
					],
				},
			],
		},
	],
});

function Editor({ onClose }) {
	return h.div(
		{ class: "overlay" },
		h.button(
			{
				onClick: () => {
					$.send("Refresh", {});
					onClose.call();
				},
			},
			"Save",
		),
	);
}

function NodeView({ node }) {
	const isEdited = $.cell(false);
	const type = node.apply((_) => _?.type);
	const name = node.apply((_) => _?.name);
	const content = node.apply((_) => _?.content);
	const children = node
		.apply((_) => _?.children || [])
		.map(
			(child) => h(NodeView, { node: child }),
			(child) => child?.id,
		);

	const onEdit = (event) => {
		isEdited.set(true);
		event?.stopPropagation?.();
	};

	const element = type.match((_) =>
		_.case("text", content).else(
			name.match((_) =>
				_.case("content", h.article(children))
					.case(
						"list",
						h.ul({ class: "TextoBlock", onClick: onEdit }, children),
					)
					.case("item", h.li(children))
					.else(h.div(children)),
			),
		),
	);

	return isEdited.match((_) =>
		_.case(true, h(Editor, { onClose: () => isEdited.set(false) })).else(
			element,
		),
	);
}

const createApp = () => {
	const source = $.signal(makeDoc());
	const root = $.cell(source, (doc) => doc);

	return function App() {
		return h.div(
			{
				onRefresh: () => source.set(makeDoc()),
			},
			h(NodeView, { node: root }),
		);
	};
};

describe("bug: application inherited state in nested mapping", () => {
	beforeEach(() => {
		domish.install();
	});

	test("bottom/top/bottom toggle keeps top list distinct", () => {
		const root = mountRoot();
		render(createApp(), {}, root);

		const expectedTop = [
			"Vision, goals & priorities",
			"Prioritize capabilities",
			"Manage backlog",
			"Relay stakeholder voice",
			"Introduce KPIs",
			"Share progress",
		];
		expect(listTexts(root, "Vision, goals & priorities")).toEqual(expectedTop);

		findList(root, "The product owner is responsible")?.click();
		findButton(root, "Save")?.click();

		findList(root, "Vision, goals & priorities")?.click();
		findButton(root, "Save")?.click();

		findList(root, "The product owner is responsible")?.click();
		findButton(root, "Save")?.click();

		expect(listTexts(root, "Vision, goals & priorities")).toEqual(expectedTop);
	});
});
