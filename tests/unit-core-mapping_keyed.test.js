import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

const findButtonsByText = (root, text) => {
	const buttons = [];
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === "button" && node.textContent === text) {
			buttons.push(node);
		}
		return undefined;
	});
	return buttons;
};

const getEditingLabels = (root) => {
	const labels = [];
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === "span" && node.getAttribute("data-role") === "editing") {
			labels.push(node.textContent);
		}
		return undefined;
	});
	return labels;
};

const createApp = (useExplicitKey = false) => {
	const { div, span, ul, li, button } = h;

	const TodoItem = ({ item, items, isEdited, onRemove }) =>
		li(
			isEdited.match(
				(_) =>
					_.case(
						true,
						div(
							span({ "data-role": "editing" }, item.apply((value) => `Editing ${value.label}`)),
							button({ onClick: () => ({ isEdited: false }) }, "Save")
						)
					),
				(_) =>
					_.else(
						div(
							span({ "data-role": "label" }, item.apply((value) => value.label)),
							button({ onClick: () => ({ isEdited: true }) }, "Edit"),
							button({ onClick: () => onRemove.call(item.get()) }, "Remove")
						)
					)
			)
		);

	const App = ({ items }) => {
		const onRemove = (entry) => {
			const i = items.get().indexOf(entry);
			if (i >= 0) {
				items.removeAt(i);
			}
		};
		return ul(
			useExplicitKey
				? items.map((item) => h(TodoItem, { item, items, onRemove }), (value) => value.id)
				: items.map((item) => h(TodoItem, { item, items, onRemove }))
		);
	};

	return App;
};

describe("mapping keyed behavior", () => {
	beforeEach(() => {
		domish.install();
	});

	test("explicit keyBy preserves local component state on middle removal", () => {
		const root = mountRoot();
		render(
			createApp(true),
			{
				items: [
					{ id: 1, label: "Item #1" },
					{ id: 2, label: "Item #2" },
					{ id: 3, label: "Item #3" },
				],
			},
			root
		);

		const editButtons = findButtonsByText(root, "Edit");
		expect(editButtons.length).toBe(3);
		editButtons[2].click();

		const removeButtons = findButtonsByText(root, "Remove");
		expect(removeButtons.length).toBe(2);
		removeButtons[1].click();

		expect(getEditingLabels(root)).toEqual(["Editing Item #3"]);
	});

	test("auto id inference preserves local state without explicit keyBy", () => {
		const root = mountRoot();
		render(
			createApp(false),
			{
				items: [
					{ id: 1, label: "Item #1" },
					{ id: 2, label: "Item #2" },
					{ id: 3, label: "Item #3" },
				],
			},
			root
		);

		const editButtons = findButtonsByText(root, "Edit");
		expect(editButtons.length).toBe(3);
		editButtons[2].click();

		const removeButtons = findButtonsByText(root, "Remove");
		expect(removeButtons.length).toBe(2);
		removeButtons[1].click();

		expect(getEditingLabels(root)).toEqual(["Editing Item #3"]);
	});

	test("no id falls back to index behavior", () => {
		const root = mountRoot();
		render(
			createApp(false),
			{
				items: [{ label: "Item #1" }, { label: "Item #2" }, { label: "Item #3" }],
			},
			root
		);

		const editButtons = findButtonsByText(root, "Edit");
		expect(editButtons.length).toBe(3);
		editButtons[2].click();

		const removeButtons = findButtonsByText(root, "Remove");
		expect(removeButtons.length).toBe(2);
		removeButtons[1].click();

		expect(getEditingLabels(root)).toEqual([]);
	});

	test("duplicate inferred keys warn and keep rendering", () => {
		const root = mountRoot();
		const originalWarn = console.warn;
		let warnings = 0;
		console.warn = () => {
			warnings += 1;
		};
		try {
			render(
				createApp(false),
				{
					items: [
						{ id: 1, label: "Item #1" },
						{ id: 1, label: "Item #1 duplicate" },
						{ id: 2, label: "Item #2" },
					],
				},
				root
			);
		} finally {
			console.warn = originalWarn;
		}

		expect(warnings).toBeGreaterThan(0);
		expect(findButtonsByText(root, "Edit").length).toBe(3);
	});
});
