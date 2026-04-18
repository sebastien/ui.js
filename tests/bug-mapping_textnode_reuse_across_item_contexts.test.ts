import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { MappingEffect } from "../src/js/ui/effects.js";
import { Selection } from "../src/js/ui/templates.js";

describe("bug: mapping text node reuse across item contexts", () => {
	beforeEach(() => {
		domish.install();
	});

	test("keyed text mapping keeps one node per key after reorder-like updates", () => {
		const input = new Selection();
		const valueSlot = new Selection();
		const keySlot = new Selection();

		const template = {
			id: 9901,
			render: (_node, _pos, context, effector) => {
				const current = context[valueSlot.id] ?? "";
				const existing = Object.hasOwn(context, template.id + 4)
					? context[template.id + 4]
					: undefined;
				if (existing) {
					existing.data = `${current}`;
					return existing;
				}
				const text = document.createTextNode(`${current}`);
				context[template.id + 4] = text;
				return text;
			},
			unrender: (context) => {
				const existing = context[template.id + 4];
				if (existing?.parentNode) {
					existing.parentNode.removeChild(existing);
				}
				context[template.id + 4] = undefined;
			},
		};

		const mapping = new MappingEffect(
			input,
			() => template,
			valueSlot,
			keySlot,
			(_value, index) => index,
		);

		const effector = new DOMEffector();
		const host = document.createElement("div");
		const anchor = document.createComment("");
		host.appendChild(anchor);

		const context = {};
		context[input.id] = ["A", "B", "C", "D", "E", "F"];
		mapping.render(anchor, 0, context, effector);

		context[input.id] = ["A", "B", "C", "D", "E", "F"];
		mapping.render(anchor, 0, context, effector);

		const texts1 = Array.from(host.childNodes)
			.filter((_) => _.nodeType === Node.TEXT_NODE)
			.map((_) => _.data);
		expect(texts1).toEqual(["A", "B", "C", "D", "E", "F"]);

		context[input.id] = ["A", "B", "C", "D", "E", "F"];
		mapping.render(anchor, 0, context, effector);

		const texts2 = Array.from(host.childNodes)
			.filter((_) => _.nodeType === Node.TEXT_NODE)
			.map((_) => _.data);
		expect(texts2).toEqual(["A", "B", "C", "D", "E", "F"]);
	});
});
