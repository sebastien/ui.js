import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	countDomNodes,
	measure,
	printMetrics,
	settle,
	summarizeRuns,
} from "./case-harness.js";
import { mountCase } from "./case-mount.js";

export const createTodolistCase = () => {
	const items = $.cell([]);
	const nextId = $.cell(1);
	let context;
	let stateItems = [];
	let nextIdValue = 1;

	const withItems = (updater) => {
		const list = stateItems.slice();
		const next = updater(list);
		stateItems = next ?? list;
		items.set(stateItems, true, context);
	};

	const addItem = (label = undefined) => {
		const id = nextIdValue;
		const text = label ?? `Item #${id}`;
		withItems((list) => {
			list.push({ id, label: text, draft: text, editing: false });
			return list;
		});
		nextIdValue = id + 1;
		nextId.set(nextIdValue, true, context);
	};

	const removeItem = (id) => {
		withItems((list) => list.filter((item) => item.id !== id));
	};

	const patchItem = (id, patch) => {
		withItems((list) =>
			list.map((item) => (item.id === id ? { ...item, ...patch } : item))
		);
	};

	const startEdit = (id) => {
		const current = stateItems.find((item) => item.id === id);
		if (!current) {
			return;
		}
		patchItem(id, { editing: true, draft: current.label });
	};

	const setDraft = (id, draft) => {
		patchItem(id, { draft });
	};

	const saveEdit = (id) => {
		const current = stateItems.find((item) => item.id === id);
		if (!current) {
			return;
		}
		patchItem(id, { label: current.draft, editing: false });
	};

	const cancelEdit = (id) => {
		const current = stateItems.find((item) => item.id === id);
		if (!current) {
			return;
		}
		patchItem(id, { draft: current.label, editing: false });
	};

	const TodoItem = ({ item }) =>
		h.li(
			{ "data-role": "todo-item" },
			item
				.apply((value) => value.editing)
				.match(
					(_) =>
						_.case(
							true,
							h.span(
								h.input({
									"data-role": "draft-input",
									value: item.apply((value) => value.draft),
									onInput: (event) => setDraft(item.get().id, event.target.value),
								}),
								h.button(
									{ "data-role": "save", onClick: () => saveEdit(item.get().id) },
									"Save"
								),
								h.button(
									{ "data-role": "cancel", onClick: () => cancelEdit(item.get().id) },
									"Cancel"
								)
							)
						),
					(_) =>
						_.else(
							h.span(
								h.span(
									{ "data-role": "label" },
									item.apply((value) => value.label)
								),
								h.button(
									{ "data-role": "edit", onClick: () => startEdit(item.get().id) },
									"Edit"
								),
								h.button(
									{ "data-role": "remove", onClick: () => removeItem(item.get().id) },
									"Remove"
								)
							)
						)
				)
		);

	const App = () =>
		h.section(
			h.h2("Todolist"),
			h.button({ "data-role": "add", onClick: () => addItem() }, "Add item"),
			h.ul(items.map((item) => h(TodoItem, { item })))
		);

	const mount = (root) => {
		const mounted = mountCase(App, root, {});
		context = mounted.derivedContext;
		stateItems = [];
		nextIdValue = 1;
		items.observable(context);
		nextId.observable(context);
		items.set(stateItems, true, context);
		nextId.set(nextIdValue, true, context);
		return mounted;
	};

	const getItems = () => stateItems.slice();

	return {
		mount,
		addItem,
		removeItem,
		startEdit,
		setDraft,
		saveEdit,
		cancelEdit,
		getItems,
	};
};

export const runTodolistBenchmark = async ({ root, runs = 10 } = {}) => {
	const allRuns = [];
	for (let runIndex = 0; runIndex < runs; runIndex++) {
		const api = createTodolistCase();
		root.replaceChildren();
		const mountRes = await measure(async () => {
			api.mount(root);
			await settle();
		});
		const domBefore = countDomNodes(root);
		const interaction = await measure(async () => {
			for (let i = 0; i < 150; i++) {
				api.addItem(`Task ${i}`);
			}
			api.startEdit(10);
			api.setDraft(10, "Task 10 updated");
			api.saveEdit(10);
			api.startEdit(20);
			api.setDraft(20, "Task 20 scratch");
			api.cancelEdit(20);
			for (let i = 1; i <= 25; i++) {
				api.removeItem(i);
			}
			await settle();
		});
		allRuns.push({
			mount_time_ms: mountRes.duration,
			interaction_total_ms: interaction.duration,
			dom_nodes_before: domBefore,
			dom_nodes_after: countDomNodes(root),
			item_count: api.getItems().length,
		});
	}

	const summary = summarizeRuns("todolist", allRuns, (runsData) => ({
		dom_nodes_before: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_before, 0) / runsData.length
		),
		dom_nodes_after: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_after, 0) / runsData.length
		),
		item_count: Math.round(
			runsData.reduce((acc, run) => acc + run.item_count, 0) / runsData.length
		),
	}));
	printMetrics("todolist", summary);
	return summary;
};
