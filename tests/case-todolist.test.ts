import { beforeEach, describe, expect, test } from "bun:test";
import { createTodolistCase } from "./case-todolist.js";
import { installDom, mountRoot } from "./test-utils.ts";

describe("case todolist", () => {
	beforeEach(() => {
		installDom();
	});

	test("supports add edit save cancel remove flows", () => {
		const root = mountRoot();
		const api = createTodolistCase();
		api.mount(root);

		api.addItem("Alpha");
		api.addItem("Beta");
		api.addItem("Gamma");

		expect(api.getItems().map((item) => item.label)).toEqual([
			"Alpha",
			"Beta",
			"Gamma",
		]);

		api.startEdit(2);
		api.setDraft(2, "Beta updated");
		api.saveEdit(2);
		expect(api.getItems().find((item) => item.id === 2)?.label).toBe("Beta updated");

		api.startEdit(3);
		api.setDraft(3, "Gamma scratch");
		api.cancelEdit(3);
		expect(api.getItems().find((item) => item.id === 3)?.label).toBe("Gamma");

		api.removeItem(1);
		expect(api.getItems().map((item) => item.id)).toEqual([2, 3]);
	});
});
