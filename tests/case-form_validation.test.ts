import { beforeEach, describe, expect, test } from "bun:test";
import { createFormValidationCase } from "./case-form_validation.js";
import { installDom, mountRoot } from "./test-utils.ts";

describe("case form validation", () => {
	beforeEach(() => {
		installDom();
	});

	test("derives submit validity from multiple fields", () => {
		const root = mountRoot();
		const api = createFormValidationCase();
		api.mount(root);

		expect(api.isValid()).toBe(false);

		api.setField("name", "Al");
		api.setField("email", "invalid");
		api.setField("password", "short");
		expect(api.isValid()).toBe(false);

		api.setField("email", "al@example.com");
		api.setField("password", "long-enough");
		expect(api.isValid()).toBe(true);
	});
});
