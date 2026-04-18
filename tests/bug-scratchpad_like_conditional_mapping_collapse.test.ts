import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { $, h } from "../src/js/ui/hyperscript.js";

const walk = (root, predicate) => {
	const out = [];
	root.iterWalk((node) => {
		if (predicate(node)) {
			out.push(node);
		}
		return undefined;
	});
	return out;
};

const findList = (root, marker) =>
	walk(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "ul" &&
			(node.getAttribute?.("class") || "").includes("TextoBlock") &&
			(node.textContent || "").includes(marker),
	)[0];

const findButton = (root, label) =>
	walk(
		root,
		(node) =>
			node.nodeName?.toLowerCase?.() === "button" && node.textContent === label,
	)[0];

const listItems = (list) =>
	(list?.childNodes || [])
		.filter((n) => n.nodeName?.toLowerCase?.() === "li")
		.map((n) => (n.textContent || "").trim());

const makeData = () => ({
	type: "root",
	children: [
		{
			type: "list",
			id: "top",
			items: [
				"Vision, goals & priorities",
				"Prioritize capabilities",
				"Manage backlog",
				"Relay stakeholder voice",
				"Introduce KPIs",
				"Share progress",
			],
		},
		{
			type: "list",
			id: "bottom",
			items: [
				"The product owner is responsible for defining the vision",
				"The product owner works with stakeholders",
				"The product owner manages backlog",
				"The product owner represents customers",
				"The product owner communicates progress",
				"Overall, the product owner plays a crucial role",
			],
		},
	],
});

function Editor({ onSave }) {
	return h.div({ class: "overlay" }, h.button({ onClick: onSave }, "Save"));
}

function ListView({ list, onRefresh }) {
	const edited = $.cell(false);
	const items = list.apply((_) => _?.items || []);
	const marker = items.apply((_) => _?.[0] || "");
	return edited.match((_) =>
		_.case(
			true,
			h(Editor, {
				onSave: () => {
					onRefresh.call();
					edited.set(false);
				},
			}),
		).else(
			h.ul(
				{
					class: "TextoBlock",
					onClick: () => edited.set(true),
					onKeyDown: (e) => e.key === "Enter" && edited.set(true),
				},
				items.map(
					(text) => h.li(text),
					(_text, index) => index,
				),
			),
		),
	);
}

function App() {
	const data = $.signal(makeData());
	const root = $.cell(data, (value) => value);
	const lists = root.apply((_) => _?.children || []);
	return h.div(
		{
			onRefreshData: () => data.set(makeData()),
		},
		lists.map(
			(list) =>
				h(ListView, { list, onRefresh: () => $.send("RefreshData", {}) }),
			() => null,
		),
	);
}

describe("bug: scratchpad-like conditional mapping collapse", () => {
	beforeEach(() => {
		domish.install();
	});

	test("bottom/top/bottom toggles do not collapse top list", () => {
		const root = document.createElement("div");
		document.body.appendChild(root);
		render(App, {}, root);

		const expectedTop = [
			"Vision, goals & priorities",
			"Prioritize capabilities",
			"Manage backlog",
			"Relay stakeholder voice",
			"Introduce KPIs",
			"Share progress",
		];

		const cycle = (marker) => {
			const list = findList(root, marker);
			expect(list).toBeDefined();
			list.click();
			const save = findButton(root, "Save");
			expect(save).toBeDefined();
			save.click();
		};

		cycle("Overall, the product owner plays a crucial role");
		cycle("Vision, goals & priorities");
		cycle("Overall, the product owner plays a crucial role");

		const top = findList(root, "Vision, goals & priorities");
		expect(top).toBeDefined();
		expect(listItems(top)).toEqual(expectedTop);
	});
});
