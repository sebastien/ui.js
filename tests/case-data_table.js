import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	countDomNodes,
	measure,
	printMetrics,
	settle,
	summarizeRuns,
} from "./case-harness.js";
import { mountCase } from "./case-mount.js";

const buildRows = (count = 500) => {
	const rows = [];
	for (let i = 0; i < count; i++) {
		rows.push({
			id: i + 1,
			name: `User ${String(i + 1).padStart(3, "0")}`,
			score: (i * 37) % 100,
			active: i % 2 === 0,
		});
	}
	return rows;
};

export const createDataTableCase = () => {
	const rows = $.cell(buildRows());
	const filter = $.cell("all");
	let context;
	let stateRows = buildRows();
	let filterMode = "all";

	const sortByScore = () => {
		stateRows = stateRows.slice().sort((a, b) => b.score - a.score);
		rows.set(stateRows, true, context);
	};

	const reverseRows = () => {
		stateRows = stateRows.slice().reverse();
		rows.set(stateRows, true, context);
	};

	const setFilter = (mode) => {
		filterMode = mode;
		filter.set(mode, true, context);
	};

	const filtered = rows.apply((list) => {
		const mode = filterMode;
		if (mode === "active") {
			return list.filter((row) => row.active);
		}
		if (mode === "inactive") {
			return list.filter((row) => !row.active);
		}
		return list;
	});

	const Row = ({ row }) =>
		h.tr(
			{ "data-row-id": row.apply((value) => `${value.id}`) },
			h.td(row.apply((value) => `${value.id}`)),
			h.td(row.apply((value) => value.name)),
			h.td(row.apply((value) => `${value.score}`)),
			h.td(row.apply((value) => (value.active ? "active" : "inactive")))
		);

	const App = () =>
		h.section(
			h.h2("Data Table"),
			h.div(
				h.button({ onClick: sortByScore, "data-role": "sort" }, "Sort score"),
				h.button({ onClick: reverseRows, "data-role": "reverse" }, "Reverse"),
				h.button({ onClick: () => setFilter("all"), "data-role": "filter-all" }, "All"),
				h.button(
					{ onClick: () => setFilter("active"), "data-role": "filter-active" },
					"Active"
				),
				h.button(
					{ onClick: () => setFilter("inactive"), "data-role": "filter-inactive" },
					"Inactive"
				)
			),
			h.table(
				h.thead(h.tr(h.th("ID"), h.th("Name"), h.th("Score"), h.th("Status"))),
				h.tbody({ "data-role": "rows" }, filtered.map((row) => h(Row, { row })))
			)
		);

	const mount = (root) => {
		const mounted = mountCase(App, root, {});
		context = mounted.derivedContext;
		stateRows = buildRows();
		filterMode = "all";
		rows.observable(context);
		filter.observable(context);
		rows.set(stateRows, true, context);
		filter.set("all", true, context);
		return mounted;
	};

	const getVisibleRows = () => {
		const mode = filterMode;
		const list = stateRows;
		if (mode === "active") {
			return list.filter((row) => row.active);
		}
		if (mode === "inactive") {
			return list.filter((row) => !row.active);
		}
		return list;
	};

		return {
			mount,
			sortByScore,
			reverseRows,
			setFilter,
			getRows: () => stateRows.slice(),
			getVisibleRows,
		};
};

export const runDataTableBenchmark = async ({ root, runs = 6 } = {}) => {
	const allRuns = [];
	for (let runIndex = 0; runIndex < runs; runIndex++) {
		const api = createDataTableCase();
		root.replaceChildren();
		const mountRes = await measure(async () => {
			api.mount(root);
			await settle();
		});
		const domBefore = countDomNodes(root);
		const interaction = await measure(async () => {
			api.sortByScore();
			api.reverseRows();
			api.sortByScore();
			api.setFilter("active");
			api.setFilter("inactive");
			api.setFilter("all");
			await settle();
		});
		allRuns.push({
			mount_time_ms: mountRes.duration,
			interaction_total_ms: interaction.duration,
			dom_nodes_before: domBefore,
			dom_nodes_after: countDomNodes(root),
			visible_rows: api.getVisibleRows().length,
		});
	}

	const summary = summarizeRuns("data_table", allRuns, (runsData) => ({
		dom_nodes_before: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_before, 0) / runsData.length
		),
		dom_nodes_after: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_after, 0) / runsData.length
		),
		visible_rows: runsData.at(-1)?.visible_rows || 0,
	}));
	printMetrics("data_table", summary);
	return summary;
};
