import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const usage =
	"Usage: npm run bench:diff -- [tests/data/benchmark-old.json tests/data/benchmark-new.json]";

const listBenchmarkFiles = async () => {
	const dataDir = path.resolve(repoRoot, "tests/data");
	const files = await readdir(dataDir).catch(() => []);
	return files
		.filter((file) => /^benchmark-\d{14}\.json$/u.test(file))
		.sort()
		.map((file) => `tests/data/${file}`);
};

const readJson = async (filePath) =>
	JSON.parse(await readFile(path.resolve(repoRoot, filePath), "utf8"));

const pct = (previous, next) => {
	if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === 0) {
		return null;
	}
	return ((next - previous) / previous) * 100;
};

const fmt = (value, digits = 2) =>
	Number.isFinite(value) ? `${value.toFixed(digits)}` : "n/a";

const sign = (value) =>
	Number.isFinite(value)
		? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
		: "n/a";

const metricLine = (label, previous, next) => {
	const delta = pct(previous, next);
	const trend = Number.isFinite(delta)
		? delta < 0
			? "improved"
			: delta > 0
				? "regressed"
				: "unchanged"
		: "n/a";
	return `- ${label}: ${fmt(previous)} -> ${fmt(next)} (${sign(delta)}, ${trend})`;
};

const ratioLine = (label, left, right) => {
	const ratio =
		Number.isFinite(left) && Number.isFinite(right) && right > 0
			? left / right
			: null;
	return `- ${label}: ${fmt(left)} / ${fmt(right)} = ${fmt(ratio, 4)}`;
};

const benchmarkLines = (prevBenchmarks, nextBenchmarks) => {
	const ids = [
		...new Set([
			...Object.keys(prevBenchmarks || {}),
			...Object.keys(nextBenchmarks || {}),
		]),
	].sort();
	const lines = [];
	for (const id of ids) {
		const prevTotal = prevBenchmarks?.[id]?.total;
		const nextTotal = nextBenchmarks?.[id]?.total;
		lines.push(metricLine(id, prevTotal, nextTotal));
	}
	return lines;
};

const frameworkLabel = (name) => {
	if (name === "preact-hooks") {
		return "Preact";
	}
	if (name === "solid") {
		return "SolidJS";
	}
	if (name === "uijs") {
		return "ui.js";
	}
	return name;
};

const frameworkDiff = (name, previousFrameworks, currentFrameworks) => {
	const prev = previousFrameworks?.[name];
	const next = currentFrameworks?.[name];
	if (!prev || !next) {
		return [`${frameworkLabel(name)}: missing in one snapshot`];
	}

	return [
		`${frameworkLabel(name)} aggregates (lower is better)`,
		metricLine(
			"totalGeomean",
			prev?.aggregates?.totalGeomean,
			next?.aggregates?.totalGeomean,
		),
		metricLine(
			"vsBaseline.totalGeomean",
			prev?.vsBaseline?.totalGeomean,
			next?.vsBaseline?.totalGeomean,
		),
		`${frameworkLabel(name)} per benchmark total (lower is better)`,
		...benchmarkLines(prev?.benchmarks, next?.benchmarks),
	];
};

const main = async () => {
	let [fromFile, toFile] = process.argv.slice(2);
	if (!fromFile || !toFile) {
		const files = await listBenchmarkFiles();
		if (files.length < 2) {
			throw new Error(
				`${usage}\nNeed at least two files matching tests/data/benchmark-YYYYMMDDHHMMSS.json`,
			);
		}
		fromFile = files[files.length - 2];
		toFile = files[files.length - 1];
		console.log(`No files provided, using latest snapshots:`);
		console.log(`- ${fromFile}`);
		console.log(`- ${toFile}`);
		console.log("");
	}

	const previous = await readJson(fromFile);
	const current = await readJson(toFile);

	const previousFrameworks = previous?.comparison?.frameworks;
	const currentFrameworks = current?.comparison?.frameworks;
	if (!previousFrameworks || !currentFrameworks) {
		throw new Error("Missing comparison.frameworks in one of the input files");
	}

	console.log("benchmark diff (ui.js, SolidJS, Preact)");
	console.log(`- from: ${fromFile}`);
	console.log(`- to:   ${toFile}`);
	console.log(`- previous tag: ${previous?.meta?.tag ?? "n/a"}`);
	console.log(`- current tag:  ${current?.meta?.tag ?? "n/a"}`);
	console.log("");

	for (const line of frameworkDiff(
		"uijs",
		previousFrameworks,
		currentFrameworks,
	)) {
		console.log(line);
	}
	console.log("");
	for (const line of frameworkDiff(
		"solid",
		previousFrameworks,
		currentFrameworks,
	)) {
		console.log(line);
	}
	console.log("");
	for (const line of frameworkDiff(
		"preact-hooks",
		previousFrameworks,
		currentFrameworks,
	)) {
		console.log(line);
	}

	const currUi = currentFrameworks?.uijs?.aggregates?.totalGeomean;
	const currSolid = currentFrameworks?.solid?.aggregates?.totalGeomean;
	const currPreact =
		currentFrameworks?.["preact-hooks"]?.aggregates?.totalGeomean;
	const prevUi = previousFrameworks?.uijs?.aggregates?.totalGeomean;
	const prevSolid = previousFrameworks?.solid?.aggregates?.totalGeomean;
	const prevPreact =
		previousFrameworks?.["preact-hooks"]?.aggregates?.totalGeomean;

	console.log("");
	console.log("Cross-framework ratios by run (totalGeomean, lower is better)");
	console.log("Previous run");
	console.log(ratioLine("ui.js / SolidJS", prevUi, prevSolid));
	console.log(ratioLine("ui.js / Preact", prevUi, prevPreact));
	console.log("Current run");
	console.log(ratioLine("ui.js / SolidJS", currUi, currSolid));
	console.log(ratioLine("ui.js / Preact", currUi, currPreact));
};

await main();
