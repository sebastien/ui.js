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
	const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	beforeEach(() => {
		domish.install();
	});

	test("removes event listeners on unrender", () => {
		let calls = 0;
		const onAction = () => {
			calls += 1;
		};

		const App = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const { effect, effector, ctx, parent } = mountWithHandle(App, {
			onAction,
		});

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

	test("$.effect runs disposer before rerun and on unmount", () => {
		const source = $.cell(0);
		const seen = [];
		const disposed = [];

		const App = () =>
			h.div({
				onMount: () => {
					$.effect(source, (value) => {
						seen.push(value);
						return () => {
							disposed.push(value);
						};
					});
				},
			});

		const { effect, effector, ctx, derivedContext } = mountWithHandle(App, {});

		source.set(1, true, derivedContext);
		expect(seen).toEqual([1]);
		expect(disposed).toEqual([]);

		source.set(2, true, derivedContext);
		expect(seen).toEqual([1, 2]);
		expect(disposed).toEqual([1]);

		effect.unrender(ctx, effector);
		expect(disposed).toEqual([1, 2]);
	});

	test("$.effect supports immediate execution", () => {
		const source = $.cell(10);
		const seen = [];
		const disposed = [];

		const App = () =>
			h.div({
				onMount: () => {
					$.effect(
						source,
						(value) => {
							seen.push(value);
							return () => {
								disposed.push(value);
							};
						},
						true,
					);
				},
			});

		const { effect, effector, ctx, derivedContext } = mountWithHandle(App, {});

		expect(seen).toEqual([10]);
		expect(disposed).toEqual([]);

		source.set(11, true, derivedContext);
		expect(seen).toEqual([10, 11]);
		expect(disposed).toEqual([10]);

		effect.unrender(ctx, effector);
		expect(disposed).toEqual([10, 11]);
	});

	test("$.effect supports array dependencies with next/prev", () => {
		const a = $.cell(1);
		const b = $.cell(2);
		const seen = [];

		const App = () =>
			h.div({
				onMount: () => {
					$.effect(
						[a, b],
						(next, prev) => {
							seen.push({ next, prev });
						},
						{ immediate: true },
					);
				},
			});

		const { derivedContext } = mountWithHandle(App, {});

		expect(seen.length).toBe(1);
		expect(seen[0]).toEqual({ next: [1, 2], prev: undefined });

		a.set(3, true, derivedContext);
		expect(seen.length).toBe(2);
		expect(seen[1]).toEqual({ next: [3, 2], prev: [1, 2] });
	});

	test("$.effect supports object dependencies", () => {
		const source = $.cell("A");
		const channel = $.cell("texto");
		const seen = [];

		const App = () =>
			h.div({
				onMount: () => {
					$.effect(
						{ source, channel },
						(next, prev) => {
							seen.push({ next, prev });
						},
						{ immediate: true },
					);
				},
			});

		const { derivedContext } = mountWithHandle(App, {});

		expect(seen.length).toBe(1);
		expect(seen[0]).toEqual({
			next: { source: "A", channel: "texto" },
			prev: undefined,
		});

		channel.set("replica", true, derivedContext);
		expect(seen.length).toBe(2);
		expect(seen[1]).toEqual({
			next: { source: "A", channel: "replica" },
			prev: { source: "A", channel: "texto" },
		});
	});

	test("$.effect async switch keeps latest run and supports api.run", async () => {
		const source = $.cell("seed");
		const output = $.cell("idle");

		const App = () =>
			h.div(
				{
					onMount: () => {
						$.effect(
							source,
							async (next, _prev, api) => {
								if (next === "slow") {
									await delay(20);
								} else if (next === "fast") {
									await delay(5);
								}
								if (api.signal.aborted) {
									return;
								}
								api.run(() => output.set(`done:${next}`));
							},
							{ immediate: false },
						);
					},
				},
				output,
			);

		const { derivedContext, parent } = mountWithHandle(App, {});

		source.set("slow", true, derivedContext);
		source.set("fast", true, derivedContext);

		await delay(35);
		expect(parent.textContent).toContain("done:fast");
		expect(parent.textContent).not.toContain("done:slow");
	});

	test("$.effect returns stop that unsubscribes and disposes", () => {
		const source = $.cell(0);
		const seen = [];
		const disposed = [];
		let stop;

		const App = () =>
			h.div({
				onMount: () => {
					stop = $.effect(
						source,
						(value) => {
							seen.push(value);
							return () => disposed.push(value);
						},
						{ immediate: true },
					);
				},
			});

		const { derivedContext } = mountWithHandle(App, {});
		expect(seen).toEqual([0]);

		source.set(1, true, derivedContext);
		expect(seen).toEqual([0, 1]);
		expect(disposed).toEqual([0]);

		stop();
		expect(disposed).toEqual([0, 1]);

		source.set(2, true, derivedContext);
		expect(seen).toEqual([0, 1]);
	});

	test("conditional branch swap cleans up old branch event handlers", () => {
		const branch = $.cell(true);
		let aCalls = 0;
		let bCalls = 0;

		const App = () =>
			h.div(
				branch.match(
					(_) => _.case(true, h.button({ onClick: () => aCalls++ }, "A")),
					(_) => _.else(h.button({ onClick: () => bCalls++ }, "B")),
				),
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
					(_) => _.else(h.span("B")),
				),
			);

		const { effect, effector, ctx, derivedContext } = mountWithHandle(App, {});
		// Subscribers are stored inline at context[id + Slot.Observable]
		const subsKey = branch.id + 1; // Slot.Observable = 1
		branch.observable(derivedContext);
		const before = derivedContext[subsKey]?.length ?? 0;
		expect(before).toBeGreaterThan(0);

		effect.unrender(ctx, effector);

		const after = derivedContext[subsKey]?.length ?? 0;
		expect(after).toBe(before - 1);
	});
});
