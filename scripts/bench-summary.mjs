import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(
	__dirname,
	"..",
	"tests/bench/js-framework-benchmark/results",
);

const latestPath = path.join(resultsDir, "latest.json");
const latest = JSON.parse(await readFile(latestPath, "utf-8"));

const f = latest.comparison.frameworks;
const fw = ["uijs", "solid", "preact-hooks"];
const benchs = latest.meta.benchmarks;

console.log("");
console.log("BENCHMARK RESULTS (ms, lower is better)");
console.log("=".repeat(80));
console.log(
	"Framework".padEnd(16) +
		benchs
			.map((b) => b.replace("01_", "").replace("0_", " ").slice(0, 10))
			.join(" "),
);
console.log("-".repeat(80));

for (const name of fw) {
	const d = f[name];
	if (!d) continue;
	const row = benchs.map((b) => {
		const v = d.benchmarks[b];
		return v ? v.total.toFixed(1).padStart(10) : "         -";
	});
	console.log(
		(name + " (" + d.vsBaseline.totalGeomean.toFixed(2) + "x)").padEnd(16) +
			row.join(" "),
	);
}

console.log(" ".repeat(16) + "(baseline: preact-hooks = 1.0x)");
console.log("=".repeat(80));
console.log("");
console.log("Full results:", latestPath);
