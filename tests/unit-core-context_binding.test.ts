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
});
