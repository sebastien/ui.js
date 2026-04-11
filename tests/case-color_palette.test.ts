import { beforeEach, describe, expect, test } from "bun:test";
import { createColorPaletteCase } from "./case-color_palette.js";
import { installDom, mountRoot } from "./test-utils.ts";

describe("case color palette", () => {
	beforeEach(() => {
		installDom();
	});

	test("propagates rgb updates to hex and hex updates to rgb", () => {
		const root = mountRoot();
		const api = createColorPaletteCase();
		api.mount(root);

		api.setRgb("r", 255);
		api.setRgb("g", 0);
		api.setRgb("b", 170);
		expect(api.getHex()).toBe("#ff00aa");

		api.setHex("#3366cc");
		expect(api.getRgb()).toEqual({ r: 51, g: 102, b: 204 });
		expect(api.getHex()).toBe("#3366cc");
	});
});
