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

const findButton = (root, label) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "button" && node.textContent === label,
	);

const findList = (root, name) =>
	findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "ul" &&
			node.getAttribute?.("data-name") === name,
	);

const listTexts = (root, name) => {
	const list = findList(root, name);
	if (!list) {
		return [];
	}
	return (list.childNodes || [])
		.filter((n) => n.nodeName?.toLowerCase?.() === "li")
		.map((n) => n.textContent?.trim?.() ?? "");
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
			listName: "top",
			children: [
				{
					type: "element",
					name: "item",
					id: 21,
					children: [
						{ type: "text", id: 211, content: "Vision", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 22,
					children: [{ type: "text", id: 221, content: "Scope", children: [] }],
				},
				{
					type: "element",
					name: "item",
					id: 23,
					children: [
						{ type: "text", id: 231, content: "Milestones", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 24,
					children: [
						{ type: "text", id: 241, content: "Share progress", children: [] },
					],
				},
			],
		},
		{
			type: "element",
			name: "list",
			id: 3,
			listName: "bottom",
			children: [
				{
					type: "element",
					name: "item",
					id: 31,
					children: [
						{
							type: "text",
							id: 311,
							content: "The product owner",
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 32,
					children: [
						{ type: "text", id: 321, content: "Own roadmap", children: [] },
					],
				},
				{
					type: "element",
					name: "item",
					id: 33,
					children: [
						{ type: "text", id: 331, content: "Report status", children: [] },
					],
				},
			],
		},
	],
});

const makeDocWithPos = () => ({
	type: "element",
	name: "content",
	id: 1,
	position: { start: 0, end: 400 },
	children: [
		{
			type: "element",
			name: "list",
			id: 2,
			listName: "top",
			position: { start: 100, end: 200 },
			children: [
				{
					type: "element",
					name: "item",
					id: 21,
					position: { start: 101, end: 110 },
					children: [
						{
							type: "text",
							id: 211,
							content: "Vision",
							position: { start: 101, end: 110 },
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 22,
					position: { start: 111, end: 120 },
					children: [
						{
							type: "text",
							id: 221,
							content: "Scope",
							position: { start: 111, end: 120 },
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 23,
					position: { start: 121, end: 130 },
					children: [
						{
							type: "text",
							id: 231,
							content: "Milestones",
							position: { start: 121, end: 130 },
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 24,
					position: { start: 131, end: 145 },
					children: [
						{
							type: "text",
							id: 241,
							content: "Share progress",
							position: { start: 131, end: 145 },
							children: [],
						},
					],
				},
			],
		},
		{
			type: "element",
			name: "list",
			id: 3,
			listName: "bottom",
			position: { start: 210, end: 320 },
			children: [
				{
					type: "element",
					name: "item",
					id: 31,
					position: { start: 211, end: 230 },
					children: [
						{
							type: "text",
							id: 311,
							content: "The product owner",
							position: { start: 211, end: 230 },
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 32,
					position: { start: 231, end: 245 },
					children: [
						{
							type: "text",
							id: 321,
							content: "Own roadmap",
							position: { start: 231, end: 245 },
							children: [],
						},
					],
				},
				{
					type: "element",
					name: "item",
					id: 33,
					position: { start: 246, end: 260 },
					children: [
						{
							type: "text",
							id: 331,
							content: "Report status",
							position: { start: 246, end: 260 },
							children: [],
						},
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
						h.ul(
							{ class: "TextoBlock", "data-name": listName, onClick: onEdit },
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
			element,
		),
	);
}

const createApplication = () => {
	const source = $.signal(makeDoc());
	const root = $.cell(source, (doc) => doc);
	return function Application() {
		return h.div(
			{
				onRefresh: () => {
					source.set(makeDoc());
				},
			},
			h(NodeView, { node: root }),
		);
	};
};

describe("bug: conditional nested mapping state leak", () => {
	beforeEach(() => {
		domish.install();
	});

	test("toggling bottom/top/bottom editor keeps top list unchanged", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);

		const expected = ["Vision", "Scope", "Milestones", "Share progress"];
		expect(listTexts(root, "top")).toEqual(expected);

		findList(root, "bottom")?.click();
		findButton(root, "Done")?.click();

		findList(root, "top")?.click();
		findButton(root, "Done")?.click();

		findList(root, "bottom")?.click();
		findButton(root, "Done")?.click();

		expect(listTexts(root, "top")).toEqual(expected);
	});

	test("repro shape: position-derived labels + recursive map remain stable", () => {
		const source = $.signal(makeDocWithPos());
		const root = $.cell(source, (doc) => doc);

		const resolveRange = (node) => {
			if (!node || typeof node !== "object") {
				return null;
			}
			if (
				node.position?.start !== undefined &&
				node.position?.end !== undefined
			) {
				return `${node.position.start}-${node.position.end}`;
			}
			for (const child of node.children || []) {
				const p = resolveRange(child);
				if (p) {
					return p;
				}
			}
			return null;
		};

		function NodeWithPos({ node }) {
			const isEdited = $.cell(false);
			const { type, name, content } = $.get(node);
			const listName = node.apply((_) => _?.listName || "");
			const pos = node.apply((_) => resolveRange(_));
			const children = node
				.apply((_) => _?.children || [])
				.map(
					(child) => h(NodeWithPos, { node: child }),
					(child) => child?.id,
				);

			const element = type.match((_) =>
				_.case("text", content).else(
					name.match((_) =>
						_.case("content", h.article({ "data-pos": pos }, children))
							.case(
								"list",
								h.ul(
									{
										class: "TextoBlock",
										"data-name": listName,
										"data-pos": pos,
										onClick: () => isEdited.set(true),
									},
									children,
								),
							)
							.case("item", h.li({ "data-pos": pos }, children))
							.else(h.div(children)),
					),
				),
			);

			return isEdited.match((_) =>
				_.case(
					true,
					h.div(
						{ class: "overlay" },
						h.button(
							{
								onClick: () => {
									$.send("Refresh2", {});
									isEdited.set(false);
								},
							},
							"Done2",
						),
					),
				).else(element),
			);
		}

		const App = () =>
			h.div(
				{
					onRefresh2: () => source.set(makeDocWithPos()),
				},
				h(NodeWithPos, { node: root }),
			);

		const host = mountRoot();
		render(App, {}, host);

		const expected = ["Vision", "Scope", "Milestones", "Share progress"];
		expect(listTexts(host, "top")).toEqual(expected);

		findList(host, "bottom")?.click();
		findButton(host, "Done2")?.click();
		findList(host, "top")?.click();
		findButton(host, "Done2")?.click();
		findList(host, "bottom")?.click();
		findButton(host, "Done2")?.click();

		expect(listTexts(host, "top")).toEqual(expected);
	});
});
