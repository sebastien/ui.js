import { beforeEach, describe, expect, test } from "bun:test";
import { createRichTextCase } from "./case-rich_text.js";
import { installDom, mountRoot } from "./test-utils.ts";

describe("case rich text", () => {
	beforeEach(() => {
		installDom();
	});

	test("supports dynamic component resolution from model type", () => {
		const root = mountRoot();
		const api = createRichTextCase();
		api.mount(root);

		const first = api.getNodes()[0];
		expect(first.type).toBe("paragraph");

		api.updateNode(first.id, { type: "code", code: "const x = 42;" });
		expect(api.getNodes()[0].type).toBe("code");
		expect(api.getNodes()[0].code).toBe("const x = 42;");

		api.rotateTypes();
		expect(api.getNodes()[0].type).toBe("paragraph");
	});
});
