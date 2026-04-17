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

describe("alias editor remount stale source", () => {
	beforeEach(() => {
		domish.install();
	});

	test("reopening editor uses latest source with updated position", () => {
		const source = $.cell("Alpha Bravo");
		const position = $.cell("0-5");

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
					nextPosition: "6-11",
				});
				onClose.call();
			};

			return h.div(
				h.textarea({ ref: textarea, value: text }),
				h.button({ onClick: onSave }, "Save"),
				h.button({ onClick: () => onClose.call() }, "Cancel"),
			);
		};

		const Node = ({ source, position }) => {
			const isEdited = $.cell(false);
			return isEdited.match((_) =>
				_.case(
					true,
					h(Editor, {
						source,
						position,
						onClose: () => isEdited.set(false),
					}),
				).else(h.button({ onClick: () => isEdited.set(true) }, "Edit")),
			);
		};

		const App = () =>
			h.div(
				{
					onPatch: (event) => {
						source.set(event.detail.nextSource);
						position.set(event.detail.nextPosition);
					},
				},
				h(Node, { source, position }),
			);

		const root = mountRoot();
		render(App, {}, root);

		const editFirst = findButton(root, "Edit");
		expect(editFirst).toBeDefined();
		editFirst.click();

		const firstTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(firstTextarea).toBeDefined();
		expect(firstTextarea.value).toBe("Alpha");

		firstTextarea.value = "Gamma Delta";
		const save = findButton(root, "Save");
		expect(save).toBeDefined();
		save.click();

		const editAgain = findButton(root, "Edit");
		expect(editAgain).toBeDefined();
		editAgain.click();

		const secondTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(secondTextarea).toBeDefined();
		expect(secondTextarea.value).toBe("Delta");
	});
});
