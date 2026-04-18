import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { $, Fragment, h } from "../src/js/ui/hyperscript.js";

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

const findList = (root, name) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "ul" &&
			node.getAttribute?.("data-list") === name,
	);

const findButton = (root, label) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "button" && node.textContent === label,
	);

const listTexts = (root, listName) => {
	const list = findList(root, listName);
	if (!list) {
		return [];
	}
	return (list.childNodes || [])
		.filter((node) => node.nodeName?.toLowerCase?.() === "li")
		.map((node) => node.textContent?.trim?.() ?? "");
};

const makeTree = () => ({
	type: "element",
	name: "content",
	id: 1,
	children: [
		{
			type: "element",
			name: "list",
			id: 10,
			listName: "top",
			children: [
				{
					type: "element",
					name: "item",
					id: 11,
					children: [
						{
							type: "text",
							id: 111,
							content: "Vision, goals & priorities",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 12,
					children: [
						{
							type: "text",
							id: 112,
							content: "Prioritize capabilities",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 13,
					children: [
						{ type: "text", id: 113, content: "Manage backlog", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 14,
					children: [
						{
							type: "text",
							id: 114,
							content: "Relay stakeholder voice",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 15,
					children: [
						{ type: "text", id: 115, content: "Introduce KPIs", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 16,
					children: [
						{ type: "text", id: 116, content: "Share progress", children: [] },
					],
				},
			],
		},
		{
			type: "element",
			name: "list",
			id: 20,
			listName: "bottom",
			children: [
				{
					type: "element",
					name: "item",
					id: 21,
					children: [
						{
							type: "text",
							id: 121,
							content: "The product owner",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 22,
					children: [
						{ type: "text", id: 122, content: "Align strategy", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 23,
					children: [
						{ type: "text", id: 123, content: "Plan roadmap", children: [] },
					],
				},
			],
		},
	],
});

function Editor({ onClose }) {
	return h.div(
		{ class: "editor" },
		h.button(
			{
				onClick: () => {
					$.send("Refresh", {});
					onClose.call();
				},
			},
			"Done",
		),
	);
}

function NodeView({ node }) {
	const isEdited = $.cell(false);
	const { type, name, content } = $.get(node);
	const listName = node.apply((_) => _?.listName || "");
	const children = node
		.apply((_) => _?.children || [])
		.map((child) => h(NodeView, { node: child }));

	const onEdit = (event) => {
		isEdited.set(true);
		event?.stopPropagation?.();
	};

	const rendered = type.match((_) =>
		_.case("text", h(Fragment, null, content)).else(
			name.match((_) =>
				_.case("content", h.article(children))
					.case(
						"list",
						h.ul(
							{ class: "TextoBlock", "data-list": listName, onClick: onEdit },
							children,
						),
					)
					.case("item", h.li(children))
					.else(h.div(children)),
			),
		),
	);

	return isEdited.match((_) =>
		_.case(true, h(Editor, { onClose: () => isEdited.set(false) })).else(
			rendered,
		),
	);
}

const createApplication = () => {
	const source = $.signal(makeTree());
	const root = $.cell(source, (value) => value);

	return function Application() {
		const onRefresh = () => {
			source.set(makeTree());
		};
		return h.div({ onRefresh }, h(NodeView, { node: root }));
	};
};

describe("bug littlewiki sibling list editor toggle duplication (ui)", () => {
	beforeEach(() => {
		domish.install();
	});

	test("bottom/top/bottom editor toggle keeps top list stable", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);

		expect(listTexts(root, "top")).toEqual([
			"Vision, goals & priorities",
			"Prioritize capabilities",
			"Manage backlog",
			"Relay stakeholder voice",
			"Introduce KPIs",
			"Share progress",
		]);

		findList(root, "bottom")?.click();
		findButton(root, "Done")?.click();

		findList(root, "top")?.click();
		findButton(root, "Done")?.click();

		findList(root, "bottom")?.click();
		findButton(root, "Done")?.click();

		expect(listTexts(root, "top")).toEqual([
			"Vision, goals & priorities",
			"Prioritize capabilities",
			"Manage backlog",
			"Relay stakeholder voice",
			"Introduce KPIs",
			"Share progress",
		]);
	});
});
