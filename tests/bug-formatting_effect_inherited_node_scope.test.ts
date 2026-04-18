import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { FormattingEffect } from "../src/js/ui/effects.js";

describe("bug: formatting effect inherited node scope", () => {
	beforeEach(() => {
		domish.install();
	});

	test("child context render does not reuse inherited text node", () => {
		const input = {
			id: 9701,
			applyContext: (context) => {
				context[input.id] = context.__value;
				return context;
			},
		};

		const effect = new FormattingEffect(input);
		const effector = new DOMEffector();

		const host = document.createElement("div");
		const parentNode = document.createTextNode("");
		const childNode = document.createTextNode("");
		host.appendChild(parentNode);
		host.appendChild(childNode);

		const parent = { __value: "parent" };
		effect.render(parentNode, 0, parent, effector);
		expect(parentNode.data).toBe("parent");
		const parentSlotNode = parent[effect.id + Slot.Node];
		expect(parentSlotNode).toBe(parentNode);

		const child = Object.create(parent);
		child.__value = "child";
		effect.render(childNode, 1, child, effector);

		expect(parentNode.data).toBe("parent");
		expect(childNode.data).toBe("child");
		expect(Object.hasOwn(child, effect.id + Slot.Node)).toBe(true);
		expect(child[effect.id + Slot.Node]).toBe(childNode);
		expect(parent[effect.id + Slot.Node]).toBe(parentSlotNode);
	});
});
