import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { render } from "../src/js/ui/client.js";
import { h } from "../src/js/ui/hyperscript.js";

const mountRoot = () => {
	const root = document.createElement("div");
	document.body.appendChild(root);
	return root;
};

const findFirstByNodeName = (root, name) => {
	let match;
	root.iterWalk((node) => {
		if (node.nodeName.toLowerCase() === name) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

describe("core callback passing", () => {
	beforeEach(() => {
		domish.install();
	});

	test("invokes callback passed from parent to descendant component", () => {
		let calls = 0;

		const onAction = () => {
			calls += 1;
		};

		const GrandChild = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const Child = ({ onAction }) => h.div(h(GrandChild, { onAction }));
		const Parent = ({ onAction }) => h.section(h(Child, { onAction }));

		const root = mountRoot();
		render(Parent, { onAction }, root);

		const button = findFirstByNodeName(root, "button");
		expect(button).toBeDefined();

		button?.click();

		expect(calls).toBe(1);
	});

	test("reused callback attaches on each element", () => {
		let calls = 0;
		const onAction = () => {
			calls += 1;
		};

		const App = ({ onAction }) =>
			h.div(
				h.button({ onClick: onAction }, "A"),
				h.button({ onClick: onAction }, "B")
			);

		const root = mountRoot();
		render(App, { onAction }, root);

		const buttons = [];
		root.iterWalk((node) => {
			if (node.nodeName.toLowerCase() === "button") {
				buttons.push(node);
			}
			return undefined;
		});

		expect(buttons.length).toBe(2);
		buttons[0]?.click();
		buttons[1]?.click();
		expect(calls).toBe(2);
	});

	test("slot callback does not leak as raw onclick attribute", () => {
		const noop = () => null;
		const Child = ({ onAction }) => h.button({ onClick: onAction }, "Run");
		const App = ({ onAction }) => h.div(h(Child, { onAction }));

		const root = mountRoot();
		render(App, { onAction: noop }, root);

		const button = findFirstByNodeName(root, "button");
		expect(button).toBeDefined();
		expect(button?.getAttribute("onclick")).toBeNull();
	});
});
