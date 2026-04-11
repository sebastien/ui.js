import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

const findByRole = (root, role) => {
	let found;
	root.iterWalk((node) => {
		if (node.getAttribute && node.getAttribute("data-role") === role) {
			found = node;
		}
		return undefined;
	});
	return found;
};

describe("class/style attribute object support", () => {
	beforeEach(() => {
		domish.install();
	});

	test("style supports a dict on static attributes", () => {
		const root = mountRoot();
		const App = () =>
			h.div(
				{
					"data-role": "target",
					style: {
						backgroundColor: "rgb(255, 0, 0)",
						"--chip-size": "12px",
					},
				},
				"x",
			);

		render(App, {}, root);
		const node = findByRole(root, "target");
		expect(node).toBeDefined();
		const style = node.getAttribute("style") || "";
		expect(style.includes("background-color:rgb(255, 0, 0)")).toBe(true);
		expect(style.includes("--chip-size:12px")).toBe(true);
	});

	test("class supports dict and list on static attributes", () => {
		const root = mountRoot();
		const App = () =>
			h.div(
				{
					"data-role": "target",
					class: ["from-list", "extra"],
					style: { color: "black" },
				},
				h.span({ class: { added: true, removed: false } }, "x"),
			);

		render(App, {}, root);
		const node = findByRole(root, "target");
		expect(node.classList.contains("from-list")).toBe(true);
		expect(node.classList.contains("extra")).toBe(true);

		let child;
		root.iterWalk((entry) => {
			if (entry.nodeName?.toLowerCase() === "span") {
				child = entry;
			}
			return undefined;
		});
		expect(child.classList.contains("added")).toBe(true);
		expect(child.classList.contains("removed")).toBe(false);
	});

	test("dynamic class dict honors true/false/null", () => {
		const root = mountRoot();
		const App = ({ mode }) =>
			h.button(
				{
					"data-role": "target",
					onClick: () => ({ mode: mode.get() === 0 ? 1 : 0 }),
					class: mode.apply((value) => ({
						on: value === 1,
						off: value === 0,
						toggle: null,
					})),
				},
				"toggle",
			);

		render(App, { mode: 0 }, root);
		const button = findByRole(root, "target");
		expect(button.classList.contains("off")).toBe(true);
		expect(button.classList.contains("on")).toBe(false);
		expect(button.classList.contains("toggle")).toBe(true);

		button.click();
		expect(button.classList.contains("off")).toBe(false);
		expect(button.classList.contains("on")).toBe(true);
		expect(button.classList.contains("toggle")).toBe(false);

		button.click();
		expect(button.classList.contains("off")).toBe(true);
		expect(button.classList.contains("on")).toBe(false);
		expect(button.classList.contains("toggle")).toBe(true);
	});

	test("dynamic style dict updates and clears missing keys", () => {
		const root = mountRoot();
		const App = ({ active }) =>
			h.button(
				{
					"data-role": "target",
					onClick: () => ({ active: !active.get() }),
					style: active.apply((value) =>
						value
							? { color: "rgb(255, 0, 0)", fontWeight: "bold" }
							: { color: "rgb(0, 0, 255)" },
					),
				},
				"switch",
			);

		render(App, { active: true }, root);
		const button = findByRole(root, "target");
		expect(button.style.color).toBe("rgb(255, 0, 0)");
		expect(button.style.fontWeight).toBe("bold");

		button.click();
		expect(button.style.color).toBe("rgb(0, 0, 255)");
		expect(button.style.fontWeight).toBe("");
	});
});
