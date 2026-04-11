import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";
import { h, $ } from "../src/js/ui/hyperscript.js";

const findFirstByNodeName = (root, name) => {
	let match;
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === name) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const mountWithHandle = (Component, data) => {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();

	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "test";
	ctx[Slot.Input] = data;

	const parent = document.createElement("div");
	const node = effect.render(parent, 0, ctx, effector);
	if (node && !node.parentNode) {
		parent.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);

	return { effect, effector, ctx, parent, derivedContext };
};

describe("core cleanup and unmounting", () => {
	beforeEach(() => {
		domish.install();
	});

	test("removes event listeners on unrender", () => {
		let calls = 0;
		const onAction = () => {
			calls += 1;
		};

		const App = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const { effect, effector, ctx, parent } = mountWithHandle(App, { onAction });

		const button = findFirstByNodeName(parent, "button");
		expect(button).toBeDefined();

		button?.click();
		expect(calls).toBe(1);

		effect.unrender(ctx, effector);
		expect(button?.parentNode).toBeNull();
		expect(button?._eventListeners?.get("click")?.size ?? 0).toBe(0);

		button?.click();
		expect(calls).toBe(1);
	});

	test("does not run onunmount multiple times for repeated unrender", () => {
		let unmountCalls = 0;
		const onUnmount = () => {
			unmountCalls += 1;
		};

		const App = ({ onUnmount }) => h.div({ onUnmount }, "Item");
		const { effect, effector, ctx } = mountWithHandle(App, { onUnmount });

		effect.unrender(ctx, effector);
		effect.unrender(ctx, effector);

		expect(unmountCalls).toBe(1);
	});

	test("conditional branch swap cleans up old branch event handlers", () => {
		const branch = $.cell(true);
		let aCalls = 0;
		let bCalls = 0;

		const App = () =>
			h.div(
				branch.match(
					(_) => _.case(true, h.button({ onClick: () => aCalls++ }, "A")),
					(_) => _.else(h.button({ onClick: () => bCalls++ }, "B"))
				)
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		branch.set(true, true, derivedContext);

		const oldButton = findFirstByNodeName(parent, "button");
		expect(oldButton).toBeDefined();
		expect(oldButton?.textContent).toBe("A");

		branch.set(false, true, derivedContext);

		const newButton = findFirstByNodeName(parent, "button");
		expect(newButton).toBeDefined();
		expect(newButton?.textContent).toBe("B");
		expect(oldButton?.parentNode).toBeNull();
		expect(oldButton?._eventListeners?.get("click")?.size ?? 0).toBe(0);

		oldButton?.click();
		newButton?.click();
		expect(aCalls).toBe(0);
		expect(bCalls).toBe(1);
	});

		test("conditional effect unsubscribes from source observable on unrender", () => {
			const branch = $.cell(true);

		const App = () =>
			h.div(
				branch.match(
					(_) => _.case(true, h.span("A")),
					(_) => _.else(h.span("B"))
				)
			);

		const { effect, effector, ctx, derivedContext } = mountWithHandle(App, {});
			const observable = branch.observable(derivedContext);
			const before = observable.subs?.length ?? 0;
			expect(before).toBeGreaterThan(0);

			effect.unrender(ctx, effector);

			const after = observable.subs?.length ?? 0;
			expect(after).toBe(before - 1);
		});
});
