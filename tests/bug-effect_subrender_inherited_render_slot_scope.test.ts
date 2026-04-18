import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { FormattingEffect } from "../src/js/ui/effects.js";

describe("bug: effect subrender inherited render slot scope", () => {
	beforeEach(() => {
		domish.install();
	});

	test("subrender allocates own Slot.Render on child contexts", () => {
		const input = {
			id: 9801,
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
		expect(Object.hasOwn(parent, effect.id + Slot.Render)).toBe(true);

		const child = Object.create(parent);
		child.__value = "child";
		effect.render(childNode, 1, child, effector);

		expect(Object.hasOwn(child, effect.id + Slot.Render)).toBe(true);
	});
});
