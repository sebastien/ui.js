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

const runReopenScenario = (source) => {
	const nodes = $.cell([{ id: 1, start: 0, end: 5 }]);
	const owner = [];
	source.applyContext(owner);

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
		);
	};

	const NodeView = ({ node, source }) => {
		const isEdited = $.cell(false);
		const position = node.apply((current) => `${current.start}-${current.end}`);
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
					source.set(event.detail.nextSource, true, owner);
					nodes.set(event.detail.nextNodes);
				},
			},
			nodes.map((node) => h(NodeView, { node, source })),
		);

	const root = mountRoot();
	render(App, {}, root);

	findButton(root, "Edit")?.click();
	const first = findNode(
		root,
		(node) => node.nodeName.toLowerCase() === "textarea",
	);
	expect(first).toBeDefined();
	expect(first.value).toBe("Alpha");

	first.value = "Gamma Delta";
	findButton(root, "Save")?.click();
	findButton(root, "Edit")?.click();

	const second = findNode(
		root,
		(node) => node.nodeName.toLowerCase() === "textarea",
	);
	expect(second).toBeDefined();
	return second.value;
};

describe("cell/signal parity for editor reopen", () => {
	beforeEach(() => {
		domish.install();
	});

	test("signal source reopens on latest slice", () => {
		expect(runReopenScenario($.signal("Alpha Bravo"))).toBe("Delta");
	});

	test("cell source stays local without a .context owner", () => {
		expect(runReopenScenario($.cell("Alpha Bravo"))).toBe("Bravo");
	});
});
