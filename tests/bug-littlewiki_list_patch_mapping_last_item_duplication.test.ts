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

const findListItems = (root) => {
	const list = findNode(root, (node) => node.nodeName.toLowerCase() === "ul");
	if (!list) {
		return [];
	}
	return (list.childNodes || []).filter(
		(node) => node.nodeName?.toLowerCase?.() === "li",
	);
};

const listState = (items, listEnd) => ({
	type: "element",
	name: "content",
	position: { start: 9, end: listEnd },
	children: [
		{
			type: "element",
			name: "list",
			position: { start: 10, end: listEnd },
			children: items.map((item) => ({
				type: "element",
				name: "item",
				position: { start: item.start, end: item.end },
				children: [{ type: "text", content: item.text, children: [] }],
			})),
		},
	],
});

const INITIAL = listState(
	[
		{ text: "ONE", start: 10, end: 16 },
		{ text: "TWO", start: 17, end: 23 },
		{ text: "THREE", start: 24, end: 32 },
	],
	32,
);

const AFTER_ADD_FOUR = listState(
	[
		{ text: "ONE", start: 10, end: 16 },
		{ text: "TWO", start: 17, end: 23 },
		{ text: "THREE", start: 24, end: 32 },
		{ text: "FOUR", start: 33, end: 40 },
	],
	40,
);

const AFTER_FOUR_XXX = listState(
	[
		{ text: "ONE", start: 10, end: 16 },
		{ text: "TWO", start: 17, end: 23 },
		{ text: "THREE", start: 24, end: 32 },
		{ text: "FOUR XXX", start: 33, end: 44 },
	],
	44,
);

const parseListTree = (text) => {
	if (text.includes("FOUR XXX")) {
		return AFTER_FOUR_XXX;
	}
	if (text.includes("4) FOUR")) {
		return AFTER_ADD_FOUR;
	}
	return INITIAL;
};

const createApplication = () => {
	const source = $.signal("1) ONE\n2) TWO\n3) THREE");
	const root = $.cell(source, (text) => parseListTree(text));

	const WikiEditor = ({ onClose, source, position }) => {
		const textarea = $.cell();
		const text = $.cell([source, position], ([value, pos]) => {
			const [start, end] = pos.split("-").map(Number);
			return value.slice(start, end);
		});
		const onSave = () => {
			const value = textarea.get()?.value ?? "";
			const [start, end] = position.get().split("-").map(Number);
			$.send("Patch", { content: value, start, end });
			onClose.call();
		};

		return h.div(
			{ class: "WikiEditor stack gap-2" },
			h.textarea({ ref: textarea, value: text }),
			h.div(
				{ class: "row gap-4" },
				h.span({ class: "fill" }),
				h.button({ class: "label", onClick: () => onClose.call() }, "Cancel"),
				h.button({ onClick: onSave }, "Save"),
			),
		);
	};

	function TextoNode({ node }) {
		const isEdited = $.cell(false);
		const { name, type, content } = $.get(node);
		const position = node.apply(
			(current) => `${current.position.start}-${current.position.end}`,
		);
		const children = node
			.apply((current) => current?.children || [])
			.map((child) => h(TextoNode, { node: child }));
		const onEdit = (event) => {
			isEdited.set(true);
			event.stopPropagation?.();
		};
		const editor = h(WikiEditor, {
			source,
			position,
			onClose: () => isEdited.set(false),
		});
		const element = type.match((_) =>
			_.case("text", h(Fragment, null, content)).else(
				name.match((_) =>
					_.case("content", h.article({ "data-pos": position }, children))
						.case(
							"list",
							h.ul(
								{ class: "TextoBlock", "data-pos": position, onClick: onEdit },
								children,
							),
						)
						.case("item", h.li({ "data-pos": position }, children))
						.else(h.div("Unknown")),
				),
			),
		);
		return isEdited.match((_) => _.case(true, editor).else(element));
	}

	return function Application() {
		const onPatch = (event) => {
			const { content = "" } = event.detail ?? {};
			const next = content;
			source.set(next);
		};
		return h.div({ onPatch }, h(TextoNode, { node: root }));
	};
};

describe("littlewiki list patch mapping last-item duplication", () => {
	beforeEach(() => {
		domish.install();
	});

	test("editing list from 3 to 4 items and then expanding last item keeps per-item identity", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);

		const listInitial = findByDataPos(root, "ul", "10-32");
		expect(listInitial).toBeDefined();
		listInitial.click();

		const firstTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(firstTextarea).toBeDefined();
		firstTextarea.value = "1) ONE\n2) TWO\n3) THREE\n4) FOUR";
		const save1 = findButton(root, "Save");
		expect(save1).toBeDefined();
		save1.click();

		expect(findListItems(root).map((node) => node.textContent)).toEqual([
			"ONE",
			"TWO",
			"THREE",
			"FOUR",
		]);

		const listAfterAdd = findByDataPos(root, "ul", "10-40");
		expect(listAfterAdd).toBeDefined();
		listAfterAdd.click();

		const secondTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(secondTextarea).toBeDefined();
		secondTextarea.value = "1) ONE\n2) TWO\n3) THREE\n4) FOUR XXX";
		const save2 = findButton(root, "Save");
		expect(save2).toBeDefined();
		save2.click();

		expect(findListItems(root).map((node) => node.textContent)).toEqual([
			"ONE",
			"TWO",
			"THREE",
			"FOUR XXX",
		]);
	});
});
