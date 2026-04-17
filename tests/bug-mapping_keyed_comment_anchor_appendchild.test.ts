import { beforeEach, describe, expect, test } from "bun:test";
import { $, h } from "../src/js/ui/hyperscript.js";
import { MappingEffect } from "../src/js/ui/effects.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

const findAllByNodeName = (root, name) => {
	const matches = [];
	root.iterWalk((node) => {
		if (node.nodeName?.toLowerCase?.() === name.toLowerCase()) {
			matches.push(node);
		}
		return undefined;
	});
	return matches;
};

describe("bug: keyed mapping under conditional anchor", () => {
	beforeEach(() => {
		installDom();
	});

	test("internal keyed renderer handles comment anchor without appendChild", () => {
		const valueSlot = {
			id: 1001,
			set: (value, _notify, context) => {
				context[1001] = value;
			},
		};
		const keySlot = {
			id: 1002,
			set: (value, _notify, context) => {
				context[1002] = value;
			},
		};
		const effect = new MappingEffect(
			{ id: -1 },
			() => ({
				id: 4242,
				render: () => document.createElement("span"),
				unrender: () => {},
			}),
			valueSlot,
			keySlot,
		);

		const host = document.createElement("div");
		const anchor = document.createComment("map-anchor");
		host.appendChild(anchor);

		const context = {};
		expect(() =>
			effect._renderKeyed(
				[
					{ id: 1, label: "alpha" },
					{ id: 2, label: "beta" },
				],
				true,
				anchor,
				[0, 0],
				context,
				null,
				effect.template.id,
			),
		).not.toThrow();

		const spans = findAllByNodeName(host, "span");
		expect(spans.length).toBe(2);
		expect(host.childNodes[0]?.nodeName?.toLowerCase?.()).toBe("span");
		expect(host.childNodes[1]?.nodeName?.toLowerCase?.()).toBe("span");
		expect(host.childNodes[2]).toBe(anchor);
	});

	test("keyed mapped branch mounted from conditional does not appendChild on comment", () => {
		const items = $.cell([
			{ id: 1, label: "alpha" },
			{ id: 2, label: "beta" },
		]);
		const toggle = $.cell(true);

		const App = () =>
			h.div(
				"prefix",
				toggle.match((_) =>
					_.case(
						true,
						items.map((item) => h.span(item.apply((value) => value.label))),
					).else(h.p("hidden")),
				),
				"suffix",
			);

		expect(() => mountWithHandle(App, {})).not.toThrow();

		const { parent, derivedContext } = mountWithHandle(App, {});
		const spans = findAllByNodeName(parent, "span");
		expect(spans.map((_) => _.textContent)).toEqual(["alpha", "beta"]);

		toggle.set(false, true, derivedContext);
		toggle.set(true, true, derivedContext);
		items.set(
			[
				{ id: 1, label: "alpha" },
				{ id: 2, label: "beta" },
				{ id: 3, label: "gamma" },
			],
			true,
			derivedContext,
		);

		const spansAfter = findAllByNodeName(parent, "span");
		expect(spansAfter.map((_) => _.textContent)).toEqual([
			"alpha",
			"beta",
			"gamma",
		]);
	});
});
