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

const createApp = () => {
	const source = $.cell("Hello World");
	const position = $.cell("0-100");
	const isEdited = $.cell(false);
	let deriveRuns = 0;
	let patched = null;

	const WikiEditor = ({ source, position, onClose }) => {
		const textarea = $.cell();
		const text = $.cell([source, position], ([source, position]) => {
			deriveRuns += 1;
			const [start, end] = position.split("-").map(Number);
			return source.slice(start, end);
		});
		const onSave = () => {
			const input = textarea.get();
			$.send("Patch", { content: input?.value ?? "" });
			onClose.call();
		};
		return h.div(
			h.textarea({ ref: textarea, value: text }),
			h.button({ onClick: onSave }, "Save"),
			h.button({ onClick: () => onClose.call() }, "Cancel"),
		);
	};

	const App = () =>
		h.div(
			{
				onPatch: (event) => {
					patched = event.detail.content;
					source.set(event.detail.content);
				},
			},
			isEdited.match((_) =>
				_.case(
					true,
					h(WikiEditor, {
						source,
						position,
						onClose: () => isEdited.set(false),
					}),
				).else(h.button({ onClick: () => isEdited.set(true) }, "Edit")),
			),
		);

	return {
		App,
		getDeriveRuns: () => deriveRuns,
		getPatched: () => patched,
	};
};

describe("editor derived value remount", () => {
	beforeEach(() => {
		domish.install();
	});

	test("reopening editor reflects latest source and recomputes derived text", () => {
		const root = mountRoot();
		const app = createApp();
		render(app.App, {}, root);

		const editButton = findButton(root, "Edit");
		expect(editButton).toBeDefined();
		editButton.click();

		const firstTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(firstTextarea).toBeDefined();
		expect(firstTextarea.value).toBe("Hello World");
		const runsAfterFirstOpen = app.getDeriveRuns();
		expect(runsAfterFirstOpen).toBeGreaterThan(0);

		firstTextarea.value = "Hello World XXX";
		const saveButton = findButton(root, "Save");
		expect(saveButton).toBeDefined();
		saveButton.click();
		expect(app.getPatched()).toBe("Hello World XXX");

		const editButtonAgain = findButton(root, "Edit");
		expect(editButtonAgain).toBeDefined();
		editButtonAgain.click();

		const secondTextarea = findNode(
			root,
			(node) => node.nodeName.toLowerCase() === "textarea",
		);
		expect(secondTextarea).toBeDefined();
		expect(app.getDeriveRuns()).toBeGreaterThan(runsAfterFirstOpen);
		expect(secondTextarea.value).toBe("Hello World XXX");
	});
});
