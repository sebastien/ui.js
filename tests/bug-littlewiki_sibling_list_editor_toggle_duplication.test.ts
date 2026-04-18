import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h, $, Fragment } from "../src/js/ui/hyperscript.js";

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

const findList = (root, id) =>
	findNode(
		root,
		(node) =>
			node.nodeName.toLowerCase() === "ul" &&
			node.getAttribute?.("data-list") === id,
	);

const findButton = (root, label) =>
	findNode(
		root,
		(node) =>
			node.nodeName.toLowerCase() === "button" && node.textContent === label,
	);

const listItems = (root, listId) => {
	const list = findList(root, listId);
	if (!list) {
		return [];
	}
	return (list.childNodes || []).filter(
		(node) => node.nodeName?.toLowerCase?.() === "li",
	);
};

const listTexts = (root, listId) =>
	listItems(root, listId).map((node) => node.textContent?.trim?.() ?? "");

const normalizeRange = (raw) => {
	if (!raw) {
		return null;
	}
	const start = Number(raw.start);
	const end = Number(raw.end);
	if (!Number.isFinite(start) || !Number.isFinite(end)) {
		return null;
	}
	return { start: Math.min(start, end), end: Math.max(start, end) };
};

const mergeRange = (left, right) => {
	if (!left) {
		return right;
	}
	if (!right) {
		return left;
	}
	return {
		start: Math.min(left.start, right.start),
		end: Math.max(left.end, right.end),
	};
};

const resolveRange = (current) => {
	if (!current || typeof current !== "object") {
		return null;
	}
	let range = normalizeRange(current.position);
	for (const child of current.children || []) {
		range = mergeRange(range, resolveRange(child));
	}
	return range;
};

const makeItem = (text, start, end) => ({
	type: "element",
	name: "item",
	position: { start, end },
	children: [
		{ type: "text", content: text, position: { start, end }, children: [] },
	],
});

const makeDocument = () => ({
	type: "element",
	name: "content",
	position: { start: 0, end: 400 },
	children: [
		{
			type: "element",
			name: "list",
			id: "top",
			position: { start: 0, end: 120 },
			children: [
				makeItem("Vision", 0, 20),
				makeItem("Scope", 21, 40),
				makeItem("Milestones", 41, 60),
			],
		},
		{
			type: "element",
			name: "paragraph",
			position: { start: 121, end: 159 },
			children: [
				{
					type: "text",
					content: "Separator",
					position: { start: 121, end: 159 },
					children: [],
				},
			],
		},
		{
			type: "element",
			name: "list",
			id: "bottom",
			position: { start: 160, end: 340 },
			children: [
				makeItem("The product owner", 160, 185),
				makeItem("Share progress", 186, 210),
				makeItem("Review risks", 211, 235),
				makeItem("Sync dependencies", 236, 260),
				makeItem("Escalate blockers", 261, 286),
				makeItem("Confirm rollout", 287, 312),
			],
		},
	],
});

const createApplication = () => {
	const tick = $.signal(0);
	const source = $.signal("unused");
	const root = $.cell([source, tick], () => makeDocument());

	const Editor = ({ onClose }) =>
		h.div(
			{ class: "Editor" },
			h.button(
				{
					onClick: () => {
						$.send("Cycle");
						onClose.call();
					},
				},
				"Done",
			),
		);

	function TextoNode({ node }) {
		const isEdited = $.cell(false);
		const { name, type, content } = $.get(node);
		const position = node.apply((current) => {
			const range = resolveRange(current);
			return range ? `${range.start}-${range.end}` : null;
		});
		const listId = node.apply((current) => current?.id || "");
		const children = node
			.apply((current) => current?.children || [])
			.map((child) => h(TextoNode, { node: child }));
		const onEdit = (event) => {
			isEdited.set(true);
			event.preventDefault?.();
			event.stopPropagation?.();
		};
		const element = type.match((_) =>
			_.case("text", h(Fragment, null, content)).else(
				name.match((_) =>
					_.case("content", h.article(children))
						.case(
							"list",
							h.ul(
								{
									class: "TextoBlock",
									"data-list": listId,
									"data-pos": position,
									onClick: onEdit,
								},
								children,
							),
						)
						.case("item", h.li({ "data-pos": position }, children))
						.case("paragraph", h.p({ "data-pos": position }, children))
						.else(h.div("Unknown")),
				),
			),
		);
		return isEdited.match((_) =>
			_.case(true, h(Editor, { onClose: () => isEdited.set(false) })).else(
				element,
			),
		);
	}

	return function Application() {
		return h.div(
			{
				onCycle: () => tick.set(tick.get() + 1),
			},
			h(TextoNode, { node: root }),
		);
	};
};

describe("littlewiki sibling list editor toggles", () => {
	beforeEach(() => {
		domish.install();
	});

	test("toggling bottom/top/bottom editors preserves top list items", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);

		expect(listTexts(root, "top")).toEqual(["Vision", "Scope", "Milestones"]);
		expect(listTexts(root, "bottom")).toEqual([
			"The product owner",
			"Share progress",
			"Review risks",
			"Sync dependencies",
			"Escalate blockers",
			"Confirm rollout",
		]);

		const bottom1 = findList(root, "bottom");
		expect(bottom1).toBeDefined();
		bottom1.click();
		const done1 = findButton(root, "Done");
		expect(done1).toBeDefined();
		done1.click();

		const top = findList(root, "top");
		expect(top).toBeDefined();
		top.click();
		const done2 = findButton(root, "Done");
		expect(done2).toBeDefined();
		done2.click();

		const bottom2 = findList(root, "bottom");
		expect(bottom2).toBeDefined();
		bottom2.click();
		const done3 = findButton(root, "Done");
		expect(done3).toBeDefined();
		done3.click();

		expect(listTexts(root, "top")).toEqual(["Vision", "Scope", "Milestones"]);
		expect(listItems(root, "top").length).toBe(3);

		const topPos = listItems(root, "top").map((node) =>
			node.getAttribute("data-pos"),
		);
		expect(new Set(topPos).size).toBe(3);
	});
});
