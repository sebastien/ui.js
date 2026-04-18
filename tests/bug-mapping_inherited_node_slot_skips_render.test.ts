import { beforeEach, describe, expect, test } from "bun:test";
import { MappingEffect } from "../src/js/ui/effects.js";
import { Slot } from "../src/js/ui/cells.js";
import { installDom } from "./test-utils.ts";

describe("bug: mapping inherited node slot", () => {
	beforeEach(() => {
		installDom();
	});

	test("keyed mapping re-renders when only inherited node slot exists", () => {
		const valueSlot = {
			id: 6001,
			set: (value, _notify, context) => {
				context[6001] = value;
			},
		};
		const keySlot = {
			id: 6002,
			set: (value, _notify, context) => {
				context[6002] = value;
			},
		};

		let renderCalls = 0;
		const templateId = 6003;
		const effect = new MappingEffect(
			{ id: 7000, applyContext: (context) => context },
			() => ({
				id: templateId,
				render: () => {
					renderCalls += 1;
					return document.createElement("li");
				},
				unrender: () => {},
			}),
			valueSlot,
			keySlot,
		);

		const parentContext = {};
		parentContext[templateId + Slot.Node] = document.createElement("li");

		const ctx = Object.create(parentContext);
		ctx[Slot.Parent] = parentContext;
		ctx[Slot.Owner] = effect;
		ctx[Slot.Name] = "MappingEffect";
		ctx[effect.id + Slot.State] = null;

		const item = { id: 1, label: "alpha" };
		ctx[valueSlot.id] = item;
		ctx[keySlot.id] = 0;

		const token = effect.normalizeKey(
			effect.resolveKey(item, 0, parentContext),
		);
		const production = new Map([[token, ctx]]);
		const mappingState = {
			production,
			order: [token],
		};
		const context = {};
		context[effect.id + Slot.State] = mappingState;

		effect._renderKeyed(
			[item],
			true,
			document.createElement("ul"),
			[0, 0],
			context,
			null,
			templateId,
		);

		expect(renderCalls).toBe(1);
		expect(Object.hasOwn(ctx, templateId + Slot.Node)).toBe(true);
	});
});
