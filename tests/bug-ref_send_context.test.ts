import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	installDom,
	mountWithHandle,
	findFirstByNodeName,
} from "./test-utils.ts";

describe("ref and send context lifecycle", () => {
	beforeEach(() => {
		installDom();
	});

	test("keeps local ref available inside click handler", () => {
		const seenRefs = [];
		const patches = [];

		const WikiEditor = () => {
			const textarea = $.cell(null);
			const onSave = () => {
				const node = textarea.get();
				seenRefs.push(node);
				$.send("Patch", { content: node?.value ?? null });
			};
			return h.div(
				h.textarea({ ref: textarea }),
				h.button({ onClick: onSave }, "Save"),
			);
		};

		const App = () =>
			h.div({ onPatch: (event) => patches.push(event.detail) }, h(WikiEditor));

		const { parent } = mountWithHandle(App, {});
		const textarea = findFirstByNodeName(parent, "textarea");
		const button = findFirstByNodeName(parent, "button");

		expect(textarea).toBeDefined();
		expect(button).toBeDefined();
		textarea.value = "Updated body";
		button.click();

		expect(seenRefs.length).toBe(1);
		expect(seenRefs[0]).toBeDefined();
		expect(seenRefs[0]?.nodeName?.toLowerCase()).toBe("textarea");
		expect(patches).toEqual([{ content: "Updated body" }]);
	});

	test("keeps local ref and Patch event working through conditional swap", () => {
		const seenRefs = [];
		const patches = [];
		const edited = $.cell(false);

		const WikiEditor = () => {
			const textarea = $.cell(null);
			const onSave = () => {
				const node = textarea.get();
				seenRefs.push(node);
				$.send("Patch", { content: node?.value ?? null });
				edited.set(false);
			};
			return h.div(
				h.textarea({ ref: textarea }),
				h.button({ onClick: onSave }, "Save"),
			);
		};

		const App = () =>
			h.div(
				{ onPatch: (event) => patches.push(event.detail) },
				edited.match((_) => _.case(true, h(WikiEditor)).else(h.h1("Title"))),
				h.button({ onClick: () => edited.set(true) }, "Edit"),
			);

		const { parent } = mountWithHandle(App, {});
		const editButton = findFirstByNodeName(parent, "button");
		expect(editButton).toBeDefined();
		editButton.click();

		const textarea = findFirstByNodeName(parent, "textarea");
		const buttons = [];
		parent.iterWalk((node) => {
			if (node.nodeName?.toLowerCase() === "button") {
				buttons.push(node);
			}
			return undefined;
		});
		const saveButton = buttons.find((node) => node.textContent === "Save");

		expect(textarea).toBeDefined();
		expect(saveButton).toBeDefined();
		textarea.value = "Conditional body";
		saveButton.click();

		expect(seenRefs.length).toBe(1);
		expect(seenRefs[0]).toBeDefined();
		expect(seenRefs[0]?.nodeName?.toLowerCase()).toBe("textarea");
		expect(patches).toEqual([{ content: "Conditional body" }]);
	});
});
