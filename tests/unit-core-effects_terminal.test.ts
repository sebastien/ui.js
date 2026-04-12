import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	installDom,
	mountWithHandle,
	findFirstByNodeName,
} from "./test-utils.ts";

describe("unit core effects terminal", () => {
	beforeEach(() => {
		installDom();
	});

	test("FormattingEffect updates rendered text from input slot", () => {
		const App = ({ message }) => h.div(message);
		const { parent } = mountWithHandle(App, { message: "hello" });
		expect(parent.textContent).toContain("hello");
	});

	test("AttributeEffect updates dynamic title from slot", () => {
		const App = ({ title }) => h.div({ title }, "X");
		const { parent } = mountWithHandle(App, { title: "hello" });
		const div = parent.childNodes[0];
		expect(div?.getAttribute("title")).toBe("hello");
	});

	test("AttributeEffect updates input and textarea value properties from slot", () => {
		const App = ({ value }) =>
			h.div(
				h.input({ type: "text", value: value.apply((entry) => entry) }),
				h.textarea({ value: value.apply((entry) => entry) }),
				h.button({ onClick: () => value.set("server") }, "Commit"),
				h.span(value),
			);
		const { parent } = mountWithHandle(App, { value: "draft" });

		const input = findFirstByNodeName(parent, "input");
		const textarea = findFirstByNodeName(parent, "textarea");
		const button = findFirstByNodeName(parent, "button");

		expect(input?.value).toBe("draft");
		expect(textarea?.value).toBe("draft");

		if (input) {
			input.value = "local-input";
		}
		if (textarea) {
			textarea.value = "local-textarea";
		}

		button?.click();
		expect(parent.textContent).toContain("server");

		expect(input?.value).toBe("server");
		expect(textarea?.value).toBe("server");
	});

	test("EventHandlerEffect handles click", () => {
		let calls = 0;
		const App = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const { parent } = mountWithHandle(App, { onAction: () => calls++ });
		const button = findFirstByNodeName(parent, "button");

		button?.click();
		button?.click();
		expect(calls).toBe(2);
	});

	test("EventHandlerEffect applies returned object updates to context slots", () => {
		const App = ({ isEdited, value }) =>
			h.div(
				h.button(
					{ onClick: () => ({ isEdited: true, value: "updated", ignored: 1 }) },
					"Save",
				),
				isEdited.apply((_) => (_ ? "edited" : "view")),
				h.span(value),
			);
		const { parent } = mountWithHandle(App, {
			isEdited: false,
			value: "draft",
		});
		const button = findFirstByNodeName(parent, "button");

		expect(parent.textContent).toContain("view");
		expect(parent.textContent).toContain("draft");
		button?.click();
		expect(parent.textContent).toContain("edited");
		expect(parent.textContent).toContain("updated");
	});

	test("EventHandlerEffect applies parent-provided handler updates in bound parent context only", () => {
		const Child = ({ status, onAction }) =>
			h.div(h.button({ onClick: onAction }, "Run"), h.span(status));
		const Parent = ({ parentStatus }) =>
			h.section(
				h(Child, {
					status: "child",
					onAction: () => ({ parentStatus: "updated", status: "changed" }),
				}),
				h.span(parentStatus),
			);
		const { parent } = mountWithHandle(Parent, { parentStatus: "parent" });
		const button = findFirstByNodeName(parent, "button");

		expect(parent.textContent).toContain("child");
		expect(parent.textContent).toContain("parent");
		button?.click();
		expect(parent.textContent).toContain("child");
		expect(parent.textContent).toContain("updated");
		expect(parent.textContent).not.toContain("changed");
	});

	test("EventHandlerEffect batches multi-slot updates to avoid duplicate recomputation", () => {
		let computes = 0;
		const App = ({ a, b }) =>
			h.div(
				h.button({ onClick: () => ({ a: 1, b: 2 }) }, "Go"),
				$(a, b).apply((va, vb) => {
					computes += 1;
					return `${va}-${vb}`;
				}),
			);
		const { parent } = mountWithHandle(App, { a: 0, b: 0 });
		const button = findFirstByNodeName(parent, "button");

		expect(computes).toBe(1);
		button?.click();
		expect(computes).toBe(2);
		expect(parent.textContent).toContain("1-2");
	});

	test("LifecycleEventHandlerEffect triggers onMount and onUnmount", () => {
		let mounted = 0;
		let unmounted = 0;
		const App = ({ onMount, onUnmount }) =>
			h.div({ onMount, onUnmount }, "Item");

		const { effect, effector, ctx } = mountWithHandle(App, {
			onMount: () => mounted++,
			onUnmount: () => unmounted++,
		});
		expect(mounted).toBe(1);
		expect(unmounted).toBe(0);

		effect.unrender(ctx, effector);
		expect(unmounted).toBe(1);
	});

	test("RefEffect assigns and clears Slot refs", () => {
		const ref = $.cell(null);
		const App = () => h.input({ ref, type: "text" });
		const { effect, effector, ctx, parent, derivedContext } = mountWithHandle(
			App,
			{},
		);
		const input = findFirstByNodeName(parent, "input");
		const getRefValue = () =>
			Object.prototype.hasOwnProperty.call(derivedContext, ref.id)
				? derivedContext[ref.id]
				: ctx[ref.id];

		expect(getRefValue()).toBe(input);

		effect.unrender(ctx, effector);
		expect(getRefValue()).toBeNull();
	});

	test("RefEffect supports callback refs", () => {
		const refs = [];
		const onRef = (node) => refs.push(node);
		const App = () => h.input({ ref: onRef, type: "text" });
		const { effect, effector, ctx, parent } = mountWithHandle(App, {});
		const input = findFirstByNodeName(parent, "input");

		expect(refs).toEqual([input]);

		effect.render(parent, 0, ctx, effector);
		expect(refs).toEqual([input]);

		effect.unrender(ctx, effector);
		expect(refs).toEqual([input, null]);
	});
});
