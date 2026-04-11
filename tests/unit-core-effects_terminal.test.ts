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
});
