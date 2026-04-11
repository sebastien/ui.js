import { runTodolistBenchmark } from "./case-todolist.js";
import { runColorPaletteBenchmark } from "./case-color_palette.js";
import { runRichTextBenchmark } from "./case-rich_text.js";
import { runDataTableBenchmark } from "./case-data_table.js";
import { runFormValidationBenchmark } from "./case-form_validation.js";

const CASES = {
	todolist: runTodolistBenchmark,
	color_palette: runColorPaletteBenchmark,
	rich_text: runRichTextBenchmark,
	data_table: runDataTableBenchmark,
	form_validation: runFormValidationBenchmark,
};

const main = async () => {
	const params = new URLSearchParams(window.location.search);
	const name = params.get("case") || "todolist";
	const runs = Number.parseInt(params.get("runs") || "8", 10);
	const runner = CASES[name];
	if (!runner) {
		throw new Error(`Unknown case: ${name}`);
	}
	const root = document.getElementById("BenchmarkRoot");
	window.runCaseBenchmark = (options = {}) => runner({ root, runs, ...options });
	console.log(`Ready for case '${name}': run window.runCaseBenchmark()`);
	if (params.get("autorun") === "1") {
		await window.runCaseBenchmark();
	}
};

await main();
