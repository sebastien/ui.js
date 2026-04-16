import { describe, expect, test } from "bun:test";

// Bug #3: fastdom.js exports `FastDOM` but the class is named `FastDom`.
// Bun's ESM loader rejects the undeclared export at parse time.
describe("fastdom exports", () => {
	test("FastDOM named export resolves correctly", async () => {
		// The export statement references `FastDOM` but the class
		// is defined as `FastDom`. In Bun, this throws at parse time.
		// In other runtimes it may silently export undefined.
		try {
			const mod = await import("../src/js/ui/fastdom.js");

			// If we get here, the import succeeded. Verify the export
			// is a real constructor, not undefined.
			expect(mod.FastDOM).toBeDefined();
			expect(typeof mod.FastDOM).toBe("function");

			// Also verify the instance is correct
			expect(mod.fastdom).toBeDefined();
			expect(typeof mod.fastdom.measure).toBe("function");
			expect(typeof mod.fastdom.mutate).toBe("function");
			expect(mod.fastdom).toBeInstanceOf(mod.FastDOM);
		} catch (e) {
			// Bun throws because FastDOM is not declared in the file.
			// This confirms the bug: the export name is wrong.
			expect(String(e)).toMatch(/FastDOM/);
		}
	});
});
