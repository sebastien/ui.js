import { beforeEach, describe, expect, test } from "bun:test";
import { h, $, Fragment } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

const findFirstByNodeName = (root, name) => {
	let match;
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === name.toLowerCase()) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const elementChildren = (node) =>
	(node?.childNodes || []).filter(
		(child) => child.nodeType === Node.ELEMENT_NODE,
	);

const nonEmptyTextChildren = (node) =>
	(node?.childNodes || []).filter(
		(child) =>
			child.nodeType === Node.TEXT_NODE &&
			typeof child.data === "string" &&
			child.data.trim().length > 0,
	);

describe("bug conditional text->element stale text", () => {
	beforeEach(() => {
		installDom();
	});

	test("switching from text branch to paragraph branch does not keep stale text node", () => {
		const mode = $.cell("text");

		const App = () =>
			h.ul(
				h.li(
					mode.match(
						(_) =>
							_.case("text", h(Fragment, null, "It can be edited in-place")),
						(_) => _.else(h.p("It can be edited in-place")),
					),
				),
			);

		const { parent, derivedContext } = mountWithHandle(App, {});
		const initial = findFirstByNodeName(parent, "li");
		expect(initial).toBeDefined();
		expect(nonEmptyTextChildren(initial).length).toBe(1);

		mode.set("paragraph", true, derivedContext);

		const li = findFirstByNodeName(parent, "li");
		expect(li).toBeDefined();
		expect(nonEmptyTextChildren(li).length).toBe(0);
		const p = elementChildren(li).filter(
			(node) => node.nodeName.toLowerCase() === "p",
		);
		expect(p.length).toBe(1);
		expect(p[0]?.textContent).toBe("It can be edited in-place");
	});
});
