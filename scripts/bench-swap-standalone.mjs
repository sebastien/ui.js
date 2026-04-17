import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";

const { div, table, tbody, tr, td, a, button } = h;

const parseArgs = (argv) => {
	const options = {
		runs: 20,
		swaps: 30,
		rows: 1000,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--runs" && argv[i + 1]) {
			options.runs = Number.parseInt(argv[++i], 10);
		} else if (arg === "--swaps" && argv[i + 1]) {
			options.swaps = Number.parseInt(argv[++i], 10);
		} else if (arg === "--rows" && argv[i + 1]) {
			options.rows = Number.parseInt(argv[++i], 10);
		}
	}
	if (!Number.isFinite(options.runs) || options.runs <= 0) {
		throw new Error("--runs must be a positive integer");
	}
	if (!Number.isFinite(options.swaps) || options.swaps <= 0) {
		throw new Error("--swaps must be a positive integer");
	}
	if (!Number.isFinite(options.rows) || options.rows < 1000) {
		throw new Error("--rows must be >= 1000 for swap benchmark");
	}
	return options;
};

const buildData = (count) => {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = { id: i + 1, label: `Item ${i + 1}` };
	}
	return data;
};

const Row = ({ row, selectedId, onRemove }) =>
	tr(
		{ class: "", key: row.apply((entry) => entry.id) },
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
								: Number.NaN;
							element.setAttribute("class", rowId === id ? "danger" : "");
						}
					}
				},
			},
			a(row.apply((entry) => entry.label)),
		),
		td(
			{
				class: "col-md-1",
				onClick: () => {
					const id = row.get().id;
					onRemove(id);
				},
			},
			a("x"),
		),
		td({ class: "col-md-6" }),
	);

const App = ({ rows, selectedId }) => {
	const updateRows = (list) => {
		rows.set(list, true);
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

	const onRemove = (id) => {
		const list = rows.list();
		const index = list.findIndex((entry) => entry.id === id);
		if (index >= 0) {
			list.splice(index, 1);
			updateRows(list);
		}
	};

	return div(
		button({ id: "swaprows", onClick: onSwapRows }, "Swap"),
		table(
			{ class: "table table-hover table-striped test-data" },
			tbody(
				rows.map(
					(row) => h(Row, { row, selectedId, onRemove }),
					(entry) => entry.id,
				),
			),
		),
	);
};

const percentile = (values, p) => {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * p) - 1),
	);
	return sorted[idx];
};

const average = (values) =>
	values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: 0;

const findNode = (root, predicate) => {
	let found;
	root.iterWalk((node) => {
		if (!found && predicate(node)) {
			found = node;
		}
		return undefined;
	});
	return found;
};

const benchOnce = ({ rowsCount, swaps }) => {
	const root = document.createElement("div");
	document.body.appendChild(root);

	const tMountStart = performance.now();
	render(App, { rows: buildData(rowsCount), selectedId: null }, root);
	const mountMs = performance.now() - tMountStart;

	const swapButton = findNode(
		root,
		(node) =>
			node.nodeName?.toLowerCase() === "button" &&
			node.getAttribute?.("id") === "swaprows",
	);
	if (!swapButton) {
		throw new Error("Swap button not found");
	}

	const swapTimes = [];
	for (let i = 0; i < swaps; i++) {
		const t0 = performance.now();
		swapButton.click();
		swapTimes.push(performance.now() - t0);
	}

	if (root.parentNode) {
		root.parentNode.removeChild(root);
	}
	return {
		mountMs,
		swapAvgMs: average(swapTimes),
		swapP95Ms: percentile(swapTimes, 0.95),
		swapTotalMs: swapTimes.reduce((sum, value) => sum + value, 0),
	};
};

const main = () => {
	const options = parseArgs(process.argv.slice(2));
	domish.install();

	const runs = [];
	for (let i = 0; i < options.runs; i++) {
		runs.push(benchOnce({ rowsCount: options.rows, swaps: options.swaps }));
	}

	const mountValues = runs.map((_) => _.mountMs);
	const swapAvgValues = runs.map((_) => _.swapAvgMs);
	const swapP95Values = runs.map((_) => _.swapP95Ms);
	const swapTotalValues = runs.map((_) => _.swapTotalMs);

	const summary = {
		runs: options.runs,
		swapsPerRun: options.swaps,
		rows: options.rows,
		mountAvgMs: Number(average(mountValues).toFixed(2)),
		mountP95Ms: Number(percentile(mountValues, 0.95).toFixed(2)),
		swapAvgMs: Number(average(swapAvgValues).toFixed(4)),
		swapP95Ms: Number(average(swapP95Values).toFixed(4)),
		swapTotalAvgMs: Number(average(swapTotalValues).toFixed(2)),
	};

	console.log("Standalone swap benchmark");
	console.log(JSON.stringify(summary, null, 2));
};

main();
