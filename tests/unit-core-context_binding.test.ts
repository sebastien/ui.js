import { beforeEach, describe, expect, test } from "bun:test";
import { $ } from "../src/js/ui/hyperscript.js";
import { Context, Slot } from "../src/js/ui/cells.js";
import { installDom } from "./test-utils.ts";

describe("core context binding", () => {
	beforeEach(() => {
		installDom();
	});

	test("$.bind captures current context and updates slot", () => {
		const value = new Slot();
		const context = [];
		let update;

		Context.Run(context, () => {
			value.observable(context);
			update = $.bind((next) => value.set(next));
		});

		update(42);
		expect(context[value.id]).toBe(42);
	});

	test("$.bind supports explicit context override", () => {
		const value = new Slot();
		const contextA = [];
		const contextB = [];

		Context.Run(contextA, () => {
			value.observable(contextA);
			value.set(1);
		});
		Context.Run(contextB, () => {
			value.observable(contextB);
			value.set(2);
		});

		const updateInB = $.bind((next) => value.set(next), contextB);
		updateInB(9);

		expect(contextA[value.id]).toBe(1);
		expect(contextB[value.id]).toBe(9);
	});

	test("$.run executes with explicit context and forwards args", () => {
		const value = new Slot();
		const context = [];

		Context.Run(context, () => {
			value.observable(context);
		});

		$.run((a, b) => value.set(a + b), context, 4, 3);
		expect(context[value.id]).toBe(7);
	});

	test("$.run uses current context by default", () => {
		const value = new Slot();
		const context = [];

		Context.Run(context, () => {
			value.observable(context);
			$.run(() => value.set(11));
		});

		expect(context[value.id]).toBe(11);
	});

	test("$.bind preserves call-time this", () => {
		const receiver = {
			base: 5,
			calc(delta) {
				return this.base + delta;
			},
		};
		const wrapped = $.bind(receiver.calc, undefined);
		expect(wrapped.call(receiver, 3)).toBe(8);
	});

	test("$.run falls back without context and returns values", () => {
		const result = $.run((a, b) => a + b, undefined, 2, 5);
		expect(result).toBe(7);
	});

	test("$.send dispatches CustomEvent on explicit node", () => {
		const node = document.createElement("div");
		const received = [];
		node.addEventListener("ui:changed", (event) => {
			received.push(event);
		});

		const sent = $.send("ui:changed", { next: 3 }, node);
		expect(sent).toBe(true);
		expect(received.length).toBe(1);
		expect(received[0].detail).toEqual({ next: 3 });
		expect(received[0].bubbles).toBe(true);
		expect(received[0].composed).toBe(true);
	});

	test("$.send infers node from current context", () => {
		const node = document.createElement("button");
		const owner = { id: 4 };
		const context = [];
		context[Slot.Owner] = owner;
		context[owner.id + Slot.Node] = node;

		let detail;
		node.addEventListener("ui:submit", (event) => {
			detail = event.detail;
		});

		const sent = Context.Run(context, () => $.send("ui:submit", "ok"));
		expect(sent).toBe(true);
		expect(detail).toBe("ok");
	});

	test("$.send normalizes event names to match onXxx handlers", () => {
		const node = document.createElement("button");
		const calls = [];
		node.addEventListener("uichanged", (event) => calls.push(event));

		expect($.send("UiChanged", 1, node)).toBe(true);
		expect($.send("onUiChanged", 2, node)).toBe(true);
		expect(calls.length).toBe(2);
		expect(calls[0].type).toBe("uichanged");
		expect(calls[0].detail).toBe(1);
		expect(calls[1].type).toBe("uichanged");
		expect(calls[1].detail).toBe(2);
	});

	test("$.send returns false without valid target", () => {
		expect($.send("ui:none", 1)).toBe(false);
		expect($.send("", 1, document.createElement("div"))).toBe(false);
	});
});
