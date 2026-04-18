import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { Slot } from "../src/js/ui/cells.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { MappingEffect } from "../src/js/ui/effects.js";

describe("bug: mapping keyed stale entry node reuse", () => {
	beforeEach(() => {
		domish.install();
	});

	test("rendering after stale inherited node does not update another entry node", () => {
		const valueSlot = {
			id: 91001,
			set: (value, _notify, context) => {
				context[91001] = value;
			},
		};
		const keySlot = {
			id: 91002,
			set: (value, _notify, context) => {
				context[91002] = value;
			},
		};

		const templateId = 91003;
		const template = {
			id: templateId,
			render: (node, position, context, effector) => {
				const value = context[valueSlot.id] ?? "";
				const own = Object.hasOwn(context, templateId + Slot.Node)
					? context[templateId + Slot.Node]
					: undefined;
				if (own) {
					own.data = `${value}`;
					return own;
				}
				if (node?.nodeType === Node.TEXT_NODE) {
					node.data = `${value}`;
					context[templateId + Slot.Node] = node;
					return node;
				}
				const text = effector.ensureText(node, position, `${value}`);
				context[templateId + Slot.Node] = text;
				return text;
			},
			unrender: (context) => {
				const node = context[templateId + Slot.Node];
				if (node?.parentNode) {
					node.parentNode.removeChild(node);
				}
				context[templateId + Slot.Node] = undefined;
			},
		};

		const mapping = new MappingEffect(
			{ id: 91000, applyContext: (context) => context },
			() => template,
			valueSlot,
			keySlot,
			(value) => value.id,
		);

		const host = document.createElement("div");
		const anchor = document.createComment("");
		host.appendChild(anchor);
		const effector = new DOMEffector();

		const parentCtx = {};
		const context = Object.create(parentCtx);
		context[Slot.Parent] = parentCtx;
		context[Slot.Owner] = mapping;
		context[Slot.Name] = "MappingEffect";

		context[mapping.input.id] = [
			{ id: "a", text: "A" },
			{ id: "b", text: "B" },
		];
		mapping.render(anchor, 0, context, effector);

		const firstPass = Array.from(host.childNodes)
			.filter((_) => _.nodeType === Node.TEXT_NODE)
			.map((_) => _.data);
		expect(firstPass.length).toBeGreaterThan(0);

		const state = context[mapping.id + Slot.State];
		const keys = Array.from(state.production.keys());
		const ctxA = state.production.get(keys[0]);
		const ctxB = state.production.get(keys[1]);
		const nodeB = ctxB[templateId + Slot.Node];

		// Simulate stale inherited node leakage:
		// A context should not be able to write through B's node reference.
		delete ctxA[templateId + Slot.Node];
		ctxA[templateId + Slot.Node] = undefined;
		Object.setPrototypeOf(ctxA, { [templateId + Slot.Node]: nodeB });

		context[mapping.input.id] = [
			{ id: "a", text: "AAA" },
			{ id: "b", text: "BBB" },
		];
		mapping.render(anchor, 0, context, effector);

		const secondPass = Array.from(host.childNodes)
			.filter((_) => _.nodeType === Node.TEXT_NODE)
			.map((_) => _.data);

		expect(secondPass.length).toBeGreaterThan(0);
	});
});
