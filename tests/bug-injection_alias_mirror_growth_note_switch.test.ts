import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { Slot } from "../src/js/ui/cells.js";
import { h, $ } from "../src/js/ui/hyperscript.js";

const INJECTION_SOURCES = Symbol.for("ui.injection.sources");

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

const mirrorCountFor = (signal) =>
	signal.context?.[INJECTION_SOURCES]?.get?.(signal.id)?.length ?? 0;

describe("injection alias mirror growth", () => {
	beforeEach(() => {
		domish.install();
	});

	test("alternating mapped editor updates keeps source mirror targets bounded", () => {
		const shortText = "Alpha Bravo";
		const longText = Array.from({ length: 120 }, (_, i) => `Item ${i}`).join(
			" ",
		);
		const nodes = $.cell([{ id: 1, start: 0, end: 5 }]);
		const source = $.signal(shortText);

		const Editor = ({ source, position, onClose }) => {
			const textarea = $.cell();
			const text = $.cell([source, position], ([value, bounds]) => {
				const [start, end] = bounds.split("-").map(Number);
				return value.slice(start, end);
			});

			const onSave = () => {
				const nextSource = textarea.get()?.value ?? "";
				const end = nextSource.length;
				const start = Math.max(0, end - 5);
				$.send("Patch", {
					nextSource,
					nextNodes: [{ id: 1, start, end }],
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
			const editor = h(Editor, {
				source,
				position,
				onClose: () => isEdited.set(false),
			});
			return isEdited.match((_) =>
				_.case(true, editor).else(
					h.div(h.button({ onClick: () => isEdited.set(true) }, "Edit")),
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

		const mirrorCounts = [];
		const renderCycleDeltas = [];
		for (let i = 0; i < 20; i += 1) {
			const edit = findButton(root, "Edit");
			expect(edit).toBeDefined();
			edit.click();

			const textarea = findNode(
				root,
				(node) => node.nodeName.toLowerCase() === "textarea",
			);
			expect(textarea).toBeDefined();

			textarea.value = i % 2 === 0 ? longText : shortText;
			const before = Slot.RenderCycle;

			const save = findButton(root, "Save");
			expect(save).toBeDefined();
			save.click();

			renderCycleDeltas.push(Slot.RenderCycle - before);
			mirrorCounts.push(mirrorCountFor(source));
		}

		const baseline = mirrorCounts[0] ?? 0;
		const mirrorMax = Math.max(...mirrorCounts);
		const deltaHeadAvg =
			renderCycleDeltas.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
		const deltaTailAvg =
			renderCycleDeltas.slice(-4).reduce((sum, value) => sum + value, 0) / 4;

		// Guard against stale alias-target accumulation in INJECTION_SOURCES.
		expect(mirrorMax).toBeLessThanOrEqual(baseline + 32);
		// Guard against runaway notify/apply work per switch.
		expect(deltaTailAvg).toBeLessThanOrEqual(deltaHeadAvg * 2);
	});
});
