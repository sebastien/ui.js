import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { EventHandlerEffect } from "../src/js/ui/effects.js";

describe("bug: event handler inherited state scope", () => {
	beforeEach(() => {
		domish.install();
	});

	test("render allocates own event state per child context", () => {
		const effect = new EventHandlerEffect(() => {}, "onclick");
		const effector = new DOMEffector();

		const parentTarget = document.createElement("button");
		const childTarget = document.createElement("button");
		const parentAttr = document.createAttribute("onclick");
		const childAttr = document.createAttribute("onclick");
		parentTarget.setAttributeNode(parentAttr);
		childTarget.setAttributeNode(childAttr);

		const parent = {};
		effect.render(parentAttr, 0, parent, effector);
		expect(Object.hasOwn(parent, effect.id + Slot.State)).toBe(true);

		const child = Object.create(parent);
		effect.render(childAttr, 0, child, effector);

		expect(Object.hasOwn(child, effect.id + Slot.State)).toBe(true);
		expect(child[effect.id + Slot.State]).not.toBe(
			parent[effect.id + Slot.State],
		);
		expect(child[effect.id + Slot.Node]).toBe(childTarget);
		expect(parent[effect.id + Slot.Node]).toBe(parentTarget);
	});
});
