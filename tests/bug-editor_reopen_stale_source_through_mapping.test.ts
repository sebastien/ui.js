import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h, $ } from "../src/js/ui/hyperscript.js";

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

const findButton = (root, label) =>
	findNode(
		root,
		(node) =>
			node.nodeName.toLowerCase() === "button" && node.textContent === label,
	);

describe("editor remount source through mapping", () => {
	beforeEach(() => {
		domish.install();
	});

	const runScenario = ({ source, expectedEcho }) => {
		const nodes = $.cell([{ id: 1, start: 0, end: 5 }]);

		const Editor = ({ source, position, onClose }) => {
			const textarea = $.cell();
			const text = $.cell([source, position], ([source, position]) => {
				const [start, end] = position.split("-").map(Number);
				return source.slice(start, end);
			});

			const onSave = () => {
				const value = textarea.get()?.value ?? "";
				$.send("Patch", {
					nextSource: value,
					nextNodes: [{ id: 1, start: 6, end: 11 }],
				});
				onClose.call();
			};

			return h.div(
				h.textarea({ ref: textarea, value: text }),
				h.button({ onClick: onSave }, "Save"),
				h.button({ onClick: () => onClose.call() }, "Cancel"),
			);
		};

		const NodeView = ({ node, source }) => {
			const isEdited = $.cell(false);
			const position = node.apply(
				(current) => `${current.start}-${current.end}`,
			);
			const sourceEcho = source.apply((value) => value);
			const editor = h(Editor, {
				source,
				position,
				onClose: () => isEdited.set(false),
			});
			return isEdited.match((_) =>
				_.case(true, editor).else(
					h.div(
						h.button({ onClick: () => isEdited.set(true) }, "Edit"),
						h.span({ "data-role": "source-echo" }, sourceEcho),
					),
				),
			);
		};

		const App = () =>
			h.div(
				{
					onPatch: (event) => {
						source.set(event.detail.nextSource);
						nodes.set(event.detail.nextNodes);
					},
				},
				nodes.map((node) => h(NodeView, { node, source })),
			);

		const root = mountRoot();
		render(App, {}, root);

		const edit = findButton(root, "Edit");
		expect(edit).toBeDefined();
		edit.click();

		const first = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(first).toBeDefined();
		expect(first.value).toBe("Alpha");

		first.value = "Gamma Delta";
		const save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();

		const editAgain = findButton(root, "Edit");
		expect(editAgain).toBeDefined();
		const echo = findNode(
			root,
			(node) => node.getAttribute?.("data-role") === "source-echo",
		);
		expect(echo).toBeDefined();
		expect(echo.textContent).toBe(expectedEcho);
		editAgain.click();

		const second = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(second).toBeDefined();
		expect(second.value).toBe(
			expectedEcho === "Gamma Delta" ? "Delta" : "Bravo",
		);
	};

	test("reopen editor reads the latest source after mapped node update", () => {
		runScenario({
			source: $.signal("Alpha Bravo"),
			expectedEcho: "Gamma Delta",
		});
	});

	test("plain cell source remains local without a shared owner context", () => {
		runScenario({
			source: $.cell("Alpha Bravo"),
			expectedEcho: "Alpha Bravo",
		});
	});
});
