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

const countOccurrences = (value, snippet) => {
	let count = 0;
	let offset = 0;
	while (offset >= 0) {
		offset = value.indexOf(snippet, offset);
		if (offset >= 0) {
			count += 1;
			offset += snippet.length;
		}
	}
	return count;
};

const createPatchReproApplication = () => {
	let source = `
# Hello World

This is a *texto* document

`;

	const buildTree = (value) => {
		const title = /^#\s+([^\n]+)/m.exec(value)?.[1] ?? "Hello World";
		const titleEnd = 3 + title.length;
		return {
			type: "element",
			name: "content",
			attributes: {},
			children: [
				{
					type: "element",
					name: "section",
					attributes: {},
					children: [
						{
							type: "element",
							name: "title",
							attributes: {},
							children: [
								{
									type: "text",
									content: title,
									attributes: {},
									children: [],
									position: { start: 3, end: titleEnd, line: 1, column: 2 },
								},
							],
							position: { start: 3, end: titleEnd, line: 1, column: 2 },
						},
						{
							type: "element",
							name: "content",
							attributes: {},
							children: [
								{
									type: "element",
									name: "p",
									attributes: {},
									children: [
										{
											type: "text",
											content: "This is a ",
											attributes: {},
											children: [],
											position: { start: 16, end: 26, line: 1, column: 0 },
										},
										{
											type: "element",
											name: "em",
											attributes: {},
											children: [
												{
													type: "text",
													content: "texto",
													attributes: {},
													children: [],
													position: { start: 27, end: 32, line: 1, column: 1 },
												},
											],
											position: { start: 26, end: 33, line: 1, column: 0 },
										},
										{
											type: "text",
											content: " document",
											attributes: {},
											children: [],
											position: { start: 33, end: 42, line: 1, column: 0 },
										},
									],
									position: { start: 16, end: 43, line: 1, column: 0 },
								},
							],
							position: { start: titleEnd, end: titleEnd, line: 1, column: 13 },
						},
					],
					position: { start: 1, end: titleEnd, line: 1, column: 0 },
				},
			],
			position: { start: 0, end: 44, line: 1, column: 0 },
		};
	};

	const WikiEditor = ({ onClose, position }) => {
		const textarea = $.cell();
		const onSave = () => {
			const input = textarea.get();
			const [start, end] = position.get().split("-").map(Number);
			$.send("Patch", { content: input?.value, start, end });
			onClose.call();
		};
		return h.div(
			{ class: "WikiEditor stack gap-2" },
			h.textarea({ ref: textarea }),
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
			({ position }) => `${position.start}-${position.end}`,
		);
		const children = node
			.apply((_) => _?.children)
			.map((child) => h(TextoNode, { node: child }));
		const onEdit = (event) => {
			isEdited.set(true || event.target);
			event.stopPropagation();
		};
		const editor = h(WikiEditor, {
			position,
			onClose: () => isEdited.set(false),
		});
		const element = type.match((_) =>
			_.case("text", h(Fragment, null, content)).else(
				name.match((_) =>
					_.case("content", h.div({ "data-pos": position }, children))
						.case("section", h.section({ "data-pos": position }, children))
						.case(
							"title",
							h.h1({ onClick: onEdit, "data-pos": position }, children),
						)
						.case("p", h.p({ onClick: onEdit, "data-pos": position }, children))
						.case("em", h.em({ "data-pos": position }, children))
						.case("element", "Element")
						.else(h.div("Unknown")),
				),
			),
		);
		return isEdited.match((_) => _.case(true, editor).else(element));
	}

	return function Application() {
		const root = $.cell(buildTree(source));
		const onPatch = (event) => {
			const { start, end, content } = event.detail;
			source = source.slice(0, start) + content + source.slice(end);
			root.set(buildTree(source));
		};
		return h.div(
			{ id: "main" },
			h.div({ class: "t p-6", onPatch }, h(TextoNode, { node: root })),
		);
	};
};

describe("littlewiki title patch duplication", () => {
	beforeEach(() => {
		domish.install();
	});

	test("save on title replaces content instead of appending duplicates", () => {
		const root = mountRoot();
		render(createPatchReproApplication(), {}, root);

		const title = findByDataPos(root, "h1", "3-14");
		expect(title).toBeDefined();
		title.click();

		const textarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(textarea).toBeDefined();
		textarea.value = "Hello World XXX";

		const saveButton = findButton(root, "Save");
		expect(saveButton).toBeDefined();
		saveButton.click();

		const html = root.innerHTML;
		expect(countOccurrences(html, "Hello World XXX")).toBe(1);
		expect(html.includes("Hello World XXX XXX")).toBeFalse();
		expect(html.includes("Hello World<!---->Hello World")).toBeFalse();
	});
});
