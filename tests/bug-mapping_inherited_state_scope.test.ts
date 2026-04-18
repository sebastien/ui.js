import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { MappingEffect } from "../src/js/ui/effects.js";
import { Selection } from "../src/js/ui/templates.js";

describe("bug: mapping inherited state scope", () => {
	beforeEach(() => {
		domish.install();
	});

	test("render allocates own Slot.State on child contexts", () => {
		const input = new Selection();
		const value = new Selection();
		const key = new Selection();
		const template = {
			id: 99501,
			render: (node, position, context, effector) =>
				effector.ensureText(node, position, `${context[value.id]}`),
			unrender: () => {},
		};
		const mapping = new MappingEffect(
			input,
			() => template,
			value,
			key,
			(_v, i) => i,
		);
		const effector = new DOMEffector();

		const parentHost = document.createElement("div");
		const parentAnchor = document.createComment("");
		parentHost.appendChild(parentAnchor);
		const parent = {};
		parent[input.id] = ["A", "B"];
		mapping.render(parentAnchor, 0, parent, effector);
		expect(Object.hasOwn(parent, mapping.id + Slot.State)).toBe(true);

		const childHost = document.createElement("div");
		const childAnchor = document.createComment("");
		childHost.appendChild(childAnchor);
		const child = Object.create(parent);
		child[input.id] = ["C", "D"];
		mapping.render(childAnchor, 0, child, effector);

		expect(Object.hasOwn(child, mapping.id + Slot.State)).toBe(true);
	});
});
