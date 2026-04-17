// Tests reproducing JS Framework Benchmark failures:
// - 04_select1k: row selection must apply "danger" class to the <tr>
// - 05_swap1k:   swapping rows 1 and 998 must reorder DOM elements

import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

const getTrs = (root) => {
	const trs = [];
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === "tr") {
			trs.push(node);
		}
		return undefined;
	});
	return trs;
};

const getTbody = (root) => {
	let found;
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === "tbody") {
			found = node;
		}
		return undefined;
	});
	return found;
};

// Minimal reproduction of the benchmark app structure
const { div, table, tbody, tr, td, a, button } = h;

const Row = ({ row, selectedId }) =>
	tr(
		{
			class: "",
			key: row.apply((entry) => entry.id),
		},
		td(
			{ class: "col-md-1" },
			row.apply((entry) => `${entry.id}`),
		),
		td(
			{
				class: "col-md-4",
				onClick: () => {
					const id = row.get().id;
					selectedId.set(id);
					const body = document.querySelector("tbody");
					if (body) {
						for (const element of body.querySelectorAll("tr")) {
							const firstCell = element.querySelector("td");
							const rowId = firstCell
								? Number.parseInt(firstCell.textContent || "", 10)
								: NaN;
							element.setAttribute("class", rowId === id ? "danger" : "");
						}
					}
				},
			},
			a(row.apply((entry) => entry.label)),
		),
	);

const App = ({ rows, selectedId }) => {
	const updateRows = (list) => {
		rows.set(list, true);
		rows.touch();
	};

	const onSwapRows = () => {
		const list = rows.list().slice();
		if (list.length > 998) {
			const item = list[1];
			list[1] = list[998];
			list[998] = item;
			updateRows(list);
		}
	};

	return div(
		button({ id: "swaprows", onClick: onSwapRows }, "Swap"),
		table(
			tbody(
				rows.map(
					(row) => h(Row, { row, selectedId }),
					(entry) => entry.id,
				),
			),
		),
	);
};

const buildData = (count) => {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = { id: i + 1, label: `Item ${i + 1}` };
	}
	return data;
};

describe("bench: select row (04_select1k)", () => {
	beforeEach(() => {
		domish.install();
	});

	test("clicking a row sets the 'danger' class on its <tr>", () => {
		const root = mountRoot();
		render(App, { rows: buildData(10), selectedId: null }, root);

		const trs = getTrs(root);
		expect(trs.length).toBe(10);

		// No row should have danger class initially
		for (const row of trs) {
			expect(row.getAttribute("class") || "").not.toContain("danger");
		}

		// Click the 5th row's link
		let link;
		trs[4].iterWalk((node) => {
			if (node.nodeName.toLowerCase() === "a") {
				link = node;
			}
			return undefined;
		});
		expect(link).toBeDefined();
		link.click();

		// The 5th row should now have class "danger"
		const updatedTrs = getTrs(root);
		expect(updatedTrs[4].getAttribute("class")).toContain("danger");

		// Other rows should not
		expect(updatedTrs[0].getAttribute("class") || "").not.toContain("danger");
		expect(updatedTrs[3].getAttribute("class") || "").not.toContain("danger");
	});

	test("selecting a different row moves the 'danger' class", () => {
		const root = mountRoot();
		render(App, { rows: buildData(10), selectedId: null }, root);

		const trs = getTrs(root);

		// Select row 3
		let link3;
		trs[2].iterWalk((node) => {
			if (node.nodeName.toLowerCase() === "a") link3 = node;
			return undefined;
		});
		link3.click();
		expect(getTrs(root)[2].getAttribute("class")).toContain("danger");

		// Select row 7
		let link7;
		getTrs(root)[6].iterWalk((node) => {
			if (node.nodeName.toLowerCase() === "a") link7 = node;
			return undefined;
		});
		link7.click();

		const after = getTrs(root);
		expect(after[6].getAttribute("class")).toContain("danger");
		expect(after[2].getAttribute("class") || "").not.toContain("danger");
	});
});

describe("bench: swap rows (05_swap1k)", () => {
	beforeEach(() => {
		domish.install();
	});

	test("swapping rows 1 and 998 reorders DOM content", () => {
		const root = mountRoot();
		render(App, { rows: buildData(1000), selectedId: null }, root);

		const trsBefore = getTrs(root);
		expect(trsBefore.length).toBe(1000);

		// Row at index 1 should have id=2, row at index 998 should have id=999
		expect(trsBefore[1].textContent).toContain("2");
		expect(trsBefore[998].textContent).toContain("999");

		// Click swap button
		let swapBtn;
		root.iterWalk((node) => {
			if (
				node.nodeName.toLowerCase() === "button" &&
				node.textContent === "Swap"
			) {
				swapBtn = node;
			}
			return undefined;
		});
		expect(swapBtn).toBeDefined();
		swapBtn.click();

		// After swap: index 1 should show id=999, index 998 should show id=2
		const trsAfter = getTrs(root);
		expect(trsAfter.length).toBe(1000);

		// Get the first td content (the id column) for rows at positions 1 and 998
		const getId = (trNode) => {
			let firstTd;
			trNode.iterWalk((node) => {
				if (node.nodeName.toLowerCase() === "td" && !firstTd) {
					firstTd = node;
				}
				return undefined;
			});
			return firstTd ? firstTd.textContent.trim() : "";
		};

		expect(getId(trsAfter[1])).toBe("999");
		expect(getId(trsAfter[998])).toBe("2");
	});
});
