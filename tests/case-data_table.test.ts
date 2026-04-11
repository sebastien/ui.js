import { beforeEach, describe, expect, test } from "bun:test";
import { createDataTableCase } from "./case-data_table.js";
import { installDom, mountRoot } from "./test-utils.ts";

describe("case data table", () => {
	beforeEach(() => {
		installDom();
	});

	test("supports sorting and filtering with stable row ids", () => {
		const root = mountRoot();
		const api = createDataTableCase();
		api.mount(root);

		const baseline = api.getRows().slice(0, 5).map((row) => row.id);
		expect(baseline).toEqual([1, 2, 3, 4, 5]);

		api.sortByScore();
		const sorted = api.getRows();
		expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[1].score);

		api.setFilter("active");
		expect(api.getVisibleRows().every((row) => row.active)).toBe(true);

		api.setFilter("inactive");
		expect(api.getVisibleRows().every((row) => !row.active)).toBe(true);

		api.setFilter("all");
		expect(api.getVisibleRows().length).toBe(api.getRows().length);
	});

	test("keeps same row identities when reversing", () => {
		const root = mountRoot();
		const api = createDataTableCase();
		api.mount(root);

		const before = api.getRows().map((row) => row.id);
		api.reverseRows();
		const after = api.getRows().map((row) => row.id);
		expect(after).toEqual(before.slice().reverse());
	});
});
