import { render as mount } from "ui/ui/client.js";
import { h, $ } from "ui/ui/hyperscript.js";

const adjectives = [
	"pretty",
	"large",
	"big",
	"small",
	"tall",
	"short",
	"long",
	"handsome",
	"plain",
	"quaint",
	"clean",
	"elegant",
	"easy",
	"angry",
	"crazy",
	"helpful",
	"mushy",
	"odd",
	"unsightly",
	"adorable",
	"important",
	"inexpensive",
	"cheap",
	"expensive",
	"fancy",
];

const colors = [
	"red",
	"yellow",
	"blue",
	"green",
	"pink",
	"brown",
	"purple",
	"brown",
	"white",
	"black",
	"orange",
];

const nouns = [
	"table",
	"chair",
	"house",
	"bbq",
	"desk",
	"car",
	"pony",
	"cookie",
	"sandwich",
	"burger",
	"pizza",
	"mouse",
	"keyboard",
];

const random = (max) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

const buildData = (count) => {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = {
			id: nextId++,
			label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
		};
	}
	return data;
};

const { div, button, h1, table, tbody, tr, td, a, span } = h;

const Button = ({ id, text, onClick }) =>
	div(
		{ class: "col-sm-6 smallpad" },
		button(
			{ id, class: "btn btn-primary btn-block", type: "button", onClick },
			text,
		),
	);

const Row = ({ row, selectedId, onSelect, onRemove }) =>
	tr(
		{
			class: $(selectedId, row).apply((currentSelected, r) =>
				r && currentSelected === r.id ? "danger" : "",
			),
			key: row.apply((entry) => entry.id),
		},
		td(
			{ class: "col-md-1" },
			row.apply((entry) => `${entry.id}`),
		),
		td(
			{ class: "col-md-4" },
			a(
				{ onClick: () => onSelect.call(row.get().id) },
				row.apply((entry) => entry.label),
			),
		),
		td(
			{ class: "col-md-1" },
			a(
				{ onClick: () => onRemove.call(row.get().id) },
				span({ class: "glyphicon glyphicon-remove", "aria-hidden": "true" }),
			),
		),
		td({ class: "col-md-6" }),
	);

const App = ({ rows, selectedId }) => {
	const updateRows = (list) => {
		rows.set(list, true);
		rows.touch();
	};

	const onRun = () => {
		updateRows(buildData(1000));
		selectedId.set(null);
	};

	const onRunLots = () => {
		updateRows(buildData(10000));
		selectedId.set(null);
	};

	const onAdd = () => {
		updateRows(rows.list().concat(buildData(1000)));
	};

	const onUpdate = () => {
		const list = rows.list();
		for (let i = 0, len = list.length; i < len; i += 10) {
			list[i] = { id: list[i].id, label: `${list[i].label} !!!` };
		}
		updateRows(list);
	};

	const onClear = () => {
		updateRows([]);
		selectedId.set(null);
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

	const onSelect = (id) => {
		selectedId.set(id);
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
		{ class: "container" },
		div(
			{ class: "jumbotron" },
			div(
				{ class: "row" },
				div({ class: "col-md-6" }, h1("ui.js")),
				div(
					{ class: "col-md-6" },
					div(
						{ class: "row" },
						h(Button, { id: "run", text: "Create 1,000 rows", onClick: onRun }),
						h(Button, {
							id: "runlots",
							text: "Create 10,000 rows",
							onClick: onRunLots,
						}),
						h(Button, { id: "add", text: "Append 1,000 rows", onClick: onAdd }),
						h(Button, {
							id: "update",
							text: "Update every 10th row",
							onClick: onUpdate,
						}),
						h(Button, { id: "clear", text: "Clear", onClick: onClear }),
						h(Button, {
							id: "swaprows",
							text: "Swap Rows",
							onClick: onSwapRows,
						}),
					),
				),
			),
		),
		table(
			{ class: "table table-hover table-striped test-data" },
			tbody(
				rows.map(
					(row) => h(Row, { row, selectedId, onSelect, onRemove }),
					(entry) => entry.id,
				),
			),
		),
		span({
			class: "preloadicon glyphicon glyphicon-remove",
			"aria-hidden": "true",
		}),
	);
};

mount(
	App,
	{
		rows: [],
		selectedId: null,
	},
	document.getElementById("main"),
);
