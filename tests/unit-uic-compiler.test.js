import { beforeEach, describe, expect, test } from "bun:test";
import * as domish from "../deps/domish/src/ts/domish/domish.ts";
import { compile } from "../src/js/uic/index.js";
import { component } from "../src/js/ui/templates.js";
import { DOMEffector } from "../src/js/ui/effectors.js";
import { Slot } from "../src/js/ui/cells.js";
import { compiled } from "../src/js/uic/runtime.js";

const mountWithHandle = (Component, data) => {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();

	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "test";
	ctx[Slot.Input] = data;

	const parent = document.createElement("div");
	const node = effect.render(parent, 0, ctx, effector);
	if (node && !node.parentNode) {
		parent.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);

	return { effect, effector, ctx, parent, derivedContext };
};

describe("uic compiler", () => {
	beforeEach(() => {
		domish.install();
	});

	test("compiles static and dynamic JSX to renderable template", () => {
		const source = `
export const App = ({ label }) => <div class="box"><span>{label}</span></div>;
`;
		const { code } = compile(source);
		expect(code.includes("compiled(")).toBe(true);
		expect(code.includes('import {compiled} from "ui/uic/runtime"')).toBe(true);
		expect(code.includes("uic:t")).toBe(true);
	});

	test("falls back to hyperscript for spread attributes", () => {
		const source = `
export const App = (props) => <div {...props}>ok</div>;
`;
		const { code } = compile(source);
		expect(code.includes('import {h} from "ui"')).toBe(true);
		expect(code.includes('h("div"')).toBe(true);
	});

	test("runtime compiled renderable updates text and attrs", () => {
		const template = () =>
			compiled('<div data-uic-node="uic:n0"><span><!--uic:t0--></span></div>', [
				{ kind: "attr", name: "title", node: "uic:n0", get: () => "hello" },
				{ kind: "text", marker: "uic:t0", get: () => "world" },
			]);
		const App = () => template();
		const { parent } = mountWithHandle(App, {});
		expect(parent.textContent).toContain("world");
		const div = parent.firstChild;
		expect(div.getAttribute("title")).toBe("hello");
	});
});
