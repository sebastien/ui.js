import { beforeEach, describe, expect, test } from "bun:test";
import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	installDom,
	mountWithHandle,
	findFirstByNodeName,
} from "./test-utils.ts";

describe("bug formatting static text overwrite", () => {
	beforeEach(() => {
		installDom();
	});

	test("slot text does not overwrite static separators between placeholders", () => {
		const position = $.signal({ start: 0, end: 217, line: 1, column: 0 });

		const App = () => {
			const { line, column, start, end } = $.get(position);
			return h.span(line, ":", column, " ", start, "->", end);
		};

		const { parent, derivedContext } = mountWithHandle(App, {});
		const span = findFirstByNodeName(parent, "span");
		expect(span?.textContent).toBe("1:0 0->217");

		position.set(
			{ start: 4, end: 8, line: 2, column: 3 },
			true,
			derivedContext,
		);
		expect(span?.textContent).toBe("2:3 4->8");
	});
});
