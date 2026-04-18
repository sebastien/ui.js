import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Application } from "../src/js/ui/templates.js";

describe("bug: application inherited render slot scope", () => {
	beforeEach(() => {
		domish.install();
	});

	test("render allocates own Slot.Render on child contexts", () => {
		const input = {
			id: 9101,
			applyContext: (context) => {
				context[input.id] = context.__value;
				return context;
			},
		};

		const app = new Application(input, (value) => value);
		const effector = new DOMEffector();
		const parentNode = document.createElement("div");
		const anchor = document.createTextNode("");
		parentNode.appendChild(anchor);

		const parent = { __value: "parent" };
		app.render(anchor, 0, parent, effector);
		expect(Object.hasOwn(parent, app.id + Slot.Render)).toBe(true);

		const child = Object.create(parent);
		child.__value = "child";
		const childAnchor = document.createTextNode("");
		parentNode.appendChild(childAnchor);

		app.render(childAnchor, 1, child, effector);

		expect(child[app.id]).toBe("child");
		expect(Object.hasOwn(child, app.id + Slot.Render)).toBe(true);
	});
});
