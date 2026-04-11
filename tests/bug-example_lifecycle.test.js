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

const getItemLabels = (root) => {
	const labels = [];
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === "span" && node.getAttribute("data-role") === "label") {
			labels.push(node.textContent);
		}
		return undefined;
	});
	return labels;
};

describe("bug example lifecycle", () => {
	beforeEach(() => {
		domish.install();
	});

	test("removing a non-last item does not duplicate labels", () => {
		const { table, thead, tbody, tfoot, th, tr, td, button, div, span } = h;

		const Item = ({ mounted, items, item, index }) =>
			div(
				{
					onMount: () => mounted.set((mounted.value || 0) + 1),
					onUnmount: () => mounted.set((mounted.value || 1) - 1),
				},
				span(
					{ "data-role": "label" },
					item.apply((x) => x.label || `Item #${index.get()}`)
				),
				button(
					{
						onClick: () => {
							items.remove(item);
						},
					},
					"Remove"
				)
			);

		const Items = ({ mounted, items, count = 0 }) =>
			table(
				thead(tr(th("Mounted"), td(mounted))),
				tbody(
					items.map((item, index) => tr(td({ colspan: 2 }, h(Item, { mounted, item, items, index }))))
				),
				tfoot(
					tr(
						td(
							{ colspan: 2 },
							button(
								{
									onClick: () => {
										const v = items.list();
										v.push({ index: v.length, label: `Item #${count.value ?? 0}` });
										items.set(v);
										count.set((count.value ?? 0) + 1);
									},
								},
								"Add items"
							)
						)
					)
				)
			);

		const root = mountRoot();
		render(Items, { items: [], mounted: 0 }, root);

		const addButton = findButtonsByText(root, "Add items")[0];
		expect(addButton).toBeDefined();

		addButton.click();
		addButton.click();
		addButton.click();

		const removeButtons = findButtonsByText(root, "Remove");
		expect(removeButtons.length).toBe(3);

		removeButtons[1].click();

		const labelsAfterRemoval = getItemLabels(root);
		expect(labelsAfterRemoval).toEqual(["Item #0", "Item #2"]);
		expect(labelsAfterRemoval).not.toContain("Item #0Item #0");
	});
});
