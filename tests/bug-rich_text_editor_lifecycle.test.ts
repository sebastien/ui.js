import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h, $ } from "../src/js/ui/hyperscript.js";
import data from "./fixtures/rich_text_data.json";

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

const countNodes = (root, predicate) => {
	let count = 0;
	root.iterWalk((node) => {
		if (predicate(node)) {
			count += 1;
		}
		return undefined;
	});
	return count;
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

const indexOfSnippet = (html, snippet) => html.indexOf(snippet);

const createApplication = () => {
	const WikiEditor = ({ onClose }) =>
		h.div(
			{ class: "WikiEditor stack gap-2" },
			h.textarea({ placeholder: "Write your wiki content here..." }),
			h.div(
				{ class: "row gap-4" },
				h.span({ class: "fill" }),
				h.button({ class: "label", onClick: () => onClose.call() }, "Cancel"),
				h.button({ onClick: () => onClose.call() }, "Save"),
			),
		);

	function TextoNode({ node, isEdited }) {
		const { name, type, content } = $.get(node);
		const position = node.apply(
			({ position }) => `${position.start}-${position.end}`,
		);
		const children = node
			.apply((_) => _.children)
			.map((child) => h(TextoNode, { node: child }));
		const onEdit = (event) => {
			isEdited.set(true);
			event.stopPropagation();
		};
		const editor = h(WikiEditor, { onClose: () => isEdited.set(false) });
		const element = type.match((_) =>
			_.case("text", `${content}`).else(
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
						.else(
							h.div(
								{ class: "Unknown" },
								`${type}`,
								" ",
								`${name}`,
								" ",
								children,
							),
						),
				),
			),
		);
		return isEdited.match((_) => _.case(true, editor).else(element));
	}

	return function Application() {
		const rootNode = data.content ? data.content : data;
		return h.div(h(TextoNode, { node: rootNode }));
	};
};

describe("rich text editor lifecycle", () => {
	beforeEach(() => {
		domish.install();
	});

	test("cancel restores title with no duplication", () => {
		const root = mountRoot();
		render(createApplication(), {}, root);

		const title = findByDataPos(root, "h1", "3-14");
		expect(title).toBeDefined();
		title.click();

		const cancelButton = findButton(root, "Cancel");
		expect(cancelButton).toBeDefined();
		cancelButton.click();

		const titles = countNodes(
			root,
			(node) =>
				node.nodeName.toLowerCase() === "h1" &&
				node.getAttribute?.("data-pos") === "3-14",
		);
		expect(titles).toBe(1);
		expect(root.innerHTML.includes('<h1 data-pos="3-14">')).toBeTrue();
		expect(
			root.innerHTML.includes("Hello World<!---->Hello World"),
		).toBeFalse();
	});

	test("edit/save/edit preserves slot and does not vanish", () => {
		const checks = {};
		const root = mountRoot();
		render(createApplication(), {}, root);

		const htmlInitial = root.innerHTML;
		checks.initialHasTitle =
			indexOfSnippet(htmlInitial, '<h1 data-pos="3-14">') >= 0;
		checks.initialHasParagraphBlock =
			indexOfSnippet(htmlInitial, '<div data-pos="14-14">') >= 0;
		checks.initialOrderCorrect =
			indexOfSnippet(htmlInitial, '<h1 data-pos="3-14">') <
			indexOfSnippet(htmlInitial, '<div data-pos="14-14">');

		const title = findByDataPos(root, "h1", "3-14");
		expect(title).toBeDefined();
		title.click();

		const htmlAfterEdit1 = root.innerHTML;
		checks.firstEditHasEditor = htmlAfterEdit1.includes(
			'class="WikiEditor stack gap-2"',
		);
		checks.firstEditOrderCorrect =
			indexOfSnippet(htmlAfterEdit1, 'class="WikiEditor stack gap-2"') <
			indexOfSnippet(htmlAfterEdit1, '<div data-pos="14-14">');
		checks.firstEditNoTitle =
			countNodes(root, (n) => n.nodeName.toLowerCase() === "h1") === 0;
		checks.firstEditOneEditor =
			countNodes(
				root,
				(n) => n.getAttribute?.("class") === "WikiEditor stack gap-2",
			) === 1;

		const saveButton = findButton(root, "Save");
		expect(saveButton).toBeDefined();
		saveButton.click();

		const htmlAfterSave = root.innerHTML;
		checks.saveHasTitle =
			indexOfSnippet(htmlAfterSave, '<h1 data-pos="3-14">') >= 0;
		checks.saveOrderCorrect =
			indexOfSnippet(htmlAfterSave, '<h1 data-pos="3-14">') <
			indexOfSnippet(htmlAfterSave, '<div data-pos="14-14">');

		const titleAgain = findByDataPos(root, "h1", "3-14");
		expect(titleAgain).toBeDefined();
		titleAgain.click();

		const htmlAfterEdit2 = root.innerHTML;
		checks.secondEditHasEditor = htmlAfterEdit2.includes(
			'class="WikiEditor stack gap-2"',
		);
		checks.secondEditOrderCorrect =
			indexOfSnippet(htmlAfterEdit2, 'class="WikiEditor stack gap-2"') <
			indexOfSnippet(htmlAfterEdit2, '<div data-pos="14-14">');
		checks.secondEditOneEditor =
			countNodes(
				root,
				(n) => n.getAttribute?.("class") === "WikiEditor stack gap-2",
			) === 1;
		checks.secondEditNoTitle =
			countNodes(root, (n) => n.nodeName.toLowerCase() === "h1") === 0;

		expect(checks).toEqual({
			initialHasTitle: true,
			initialHasParagraphBlock: true,
			initialOrderCorrect: true,
			firstEditHasEditor: true,
			firstEditOrderCorrect: true,
			firstEditNoTitle: true,
			firstEditOneEditor: true,
			saveHasTitle: true,
			saveOrderCorrect: true,
			secondEditHasEditor: true,
			secondEditOrderCorrect: true,
			secondEditOneEditor: true,
			secondEditNoTitle: true,
		});
	});
});
