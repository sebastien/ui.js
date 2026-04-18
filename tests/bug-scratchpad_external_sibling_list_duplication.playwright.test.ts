import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";

const URL = "http://localhost:8000/src/html/scratchpad.html";

describe("bug: scratchpad external sibling list duplication", () => {
	test("bottom/top/bottom editor toggles keep first list stable", async () => {
		const browser = await chromium.launch({
			headless: true,
			executablePath: "/opt/google/chrome/chrome",
			args: ["--no-sandbox"],
		});
		const page = await browser.newPage();

		const pickTop = async (pos?: string) => {
			const selector = pos
				? `ul.TextoBlock[data-pos="${pos}"]`
				: "ul.TextoBlock";
			const top = page.locator(selector).first();
			await top.waitFor({ state: "visible", timeout: 10000 });
			return top;
		};

		const pickBottom = async () => {
			const bottom = page
				.locator("ul.TextoBlock")
				.filter({ hasText: "The product owner" })
				.first();
			await bottom.waitFor({ state: "visible", timeout: 10000 });
			return bottom;
		};

		const closeEditor = async () => {
			await page.evaluate(() => {
				document
					.querySelector("div.fix.cover")
					?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			await page.waitForTimeout(120);
		};

		try {
			await page.goto(URL, { waitUntil: "networkidle" });
			await page.waitForTimeout(1800);
			await page.waitForSelector("ul.TextoBlock", { timeout: 10000 });
			const dump = await page.locator("ul.TextoBlock").allTextContents();
			expect(dump.length).toBeGreaterThan(0);

			const top = await pickTop();
			const topPos = await top.getAttribute("data-pos");
			expect(topPos).toBeTruthy();
			const expected = (await top.locator("li").allTextContents()).map((_) =>
				_.trim(),
			);
			expect(expected.length).toBeGreaterThan(0);

			const bottom1 = await pickBottom();
			await bottom1.click();
			await closeEditor();

			const top1 = await pickTop(topPos!);
			await top1.click();
			await closeEditor();

			const bottom2 = await pickBottom();
			await bottom2.click();
			await closeEditor();

			const current = (
				await (await pickTop(topPos!)).locator("li").allTextContents()
			).map((_) => _.trim());
			expect(current).toEqual(expected);
		} finally {
			await browser.close();
		}
	}, 180000);
});
