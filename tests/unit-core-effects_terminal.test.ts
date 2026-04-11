import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle, findFirstByNodeName } from "./test-utils.ts";

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

	test("EventHandlerEffect handles click", () => {
		let calls = 0;
		const App = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const { parent } = mountWithHandle(App, { onAction: () => calls++ });
		const button = findFirstByNodeName(parent, "button");

		button?.click();
		button?.click();
		expect(calls).toBe(2);
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
		const { effect, effector, ctx, parent, derivedContext } = mountWithHandle(App, {});
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
