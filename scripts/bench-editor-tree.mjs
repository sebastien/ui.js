import http from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(repoRoot, "tests", "data");
const RESULTS_PREFIX = "benchmark-editor-tree";
const FRAMEWORKS = ["solidjs", "ui"];

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
};

const round = (value, precision = 2) => Number(value.toFixed(precision));

const average = (values) =>
	values.length
		? values.reduce((total, value) => total + value, 0) / values.length
		: 0;

const parseArgs = (argv) => {
	const options = {
		runs: 5,
		headed: false,
		save: true,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--runs" && argv[i + 1]) {
			options.runs = Number.parseInt(argv[++i], 10);
		} else if (arg === "--headed") {
			options.headed = true;
		} else if (arg === "--save") {
			options.save = true;
		} else if (arg === "--no-save") {
			options.save = false;
		}
	}
	if (!Number.isFinite(options.runs) || options.runs <= 0) {
		throw new Error("--runs must be a positive integer");
	}
	return options;
};

const ensureInsideRoot = (pathname) => {
	const filePath = path.resolve(repoRoot, `.${pathname}`);
	if (!filePath.startsWith(repoRoot)) {
		throw new Error("Path escapes repository root");
	}
	return filePath;
};

const serveFile = async (pathname) => {
	let filePath = ensureInsideRoot(pathname);
	let fileStat = await stat(filePath).catch(() => null);
	if (fileStat?.isDirectory()) {
		filePath = path.join(filePath, "index.html");
		fileStat = await stat(filePath).catch(() => null);
	}
	if (!fileStat?.isFile()) {
		return null;
	}
	return {
		body: await readFile(filePath),
		contentType:
			MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
	};
};

const createServer = () =>
	http.createServer(async (request, response) => {
		const url = new URL(request.url, "http://127.0.0.1");
		const file = await serveFile(url.pathname).catch(() => null);
		if (!file) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": file.contentType });
		response.end(file.body);
	});

const isoTimestampForFile = (date) => {
	const pad = (value) => `${value}`.padStart(2, "0");
	return [
		date.getUTCFullYear(),
		pad(date.getUTCMonth() + 1),
		pad(date.getUTCDate()),
		pad(date.getUTCHours()),
		pad(date.getUTCMinutes()),
		pad(date.getUTCSeconds()),
	].join("");
};

const writeJson = async (filePath, value) => {
	await writeFile(filePath, JSON.stringify(value, null, 2));
};

const summarizeRuns = (framework, runs) => {
	const sizeNames = runs[0]?.sizes.map((_) => _.name) || [];
	const summaries = [];

	for (const sizeName of sizeNames) {
		const sizeRuns = runs
			.map((_) => _.sizes.find((size) => size.name === sizeName))
			.filter(Boolean);
		const phaseNames = [
			...new Set(
				sizeRuns.flatMap((_) => _.patches.phases.map((phase) => phase.name)),
			),
		];
		const phases = Object.fromEntries(
			phaseNames.map((phaseName) => [
				phaseName,
				round(
					average(
						sizeRuns.map(
							(run) =>
								run.patches.phases.find((phase) => phase.name === phaseName)
									?.totalDuration || 0,
						),
					),
				),
			]),
		);

		summaries.push({
			framework,
			size: sizeName,
			runs: sizeRuns.length,
			initialMs: round(average(sizeRuns.map((_) => _.initial.duration))),
			patchTotalMs: round(
				average(sizeRuns.map((_) => _.patches.totalDuration)),
			),
			domNodeCount: round(average(sizeRuns.map((_) => _.initial.nodeCount))),
			docNodeCount: round(average(sizeRuns.map((_) => _.docNodeCount))),
			textLength: round(average(sizeRuns.map((_) => _.textLength))),
			phases,
		});
	}

	return summaries;
};

const formatSummaryTable = (summaries) => {
	const phaseNames = [
		...new Set(summaries.flatMap((summary) => Object.keys(summary.phases))),
	];
	const rows = summaries.map((summary) => ({
		framework: summary.framework,
		size: summary.size,
		runs: summary.runs,
		initial_ms: summary.initialMs,
		patch_total_ms: summary.patchTotalMs,
		dom_nodes: summary.domNodeCount,
		doc_nodes: summary.docNodeCount,
		text_chars: summary.textLength,
		...Object.fromEntries(
			phaseNames.map((name) => [name, `${summary.phases[name] ?? 0}`]),
		),
	}));

	const headers = [
		"framework",
		"size",
		"runs",
		"initial_ms",
		"patch_total_ms",
		"dom_nodes",
		"doc_nodes",
		"text_chars",
		...phaseNames,
	];
	const widths = Object.fromEntries(
		headers.map((header) => [
			header,
			Math.max(
				header.length,
				...rows.map((row) => `${row[header] ?? ""}`.length),
			),
		]),
	);

	return [
		headers.map((header) => header.padEnd(widths[header])).join("  "),
		headers.map((header) => "-".repeat(widths[header])).join("  "),
		...rows.map((row) =>
			headers
				.map((header) => `${row[header] ?? ""}`.padEnd(widths[header]))
				.join("  "),
		),
	].join("\n");
};

const compareToBaseline = (summaries, baselineFramework = "ui") => {
	const baselineBySize = new Map(
		summaries
			.filter((_) => _.framework === baselineFramework)
			.map((_) => [_.size, _]),
	);
	const rows = [];
	for (const summary of summaries) {
		if (summary.framework === baselineFramework) {
			continue;
		}
		const baseline = baselineBySize.get(summary.size);
		if (!baseline) {
			continue;
		}
		const phaseNames = [
			...new Set([
				...Object.keys(baseline.phases || {}),
				...Object.keys(summary.phases || {}),
			]),
		];
		rows.push({
			framework: summary.framework,
			size: summary.size,
			initialDeltaMs: round(summary.initialMs - baseline.initialMs),
			patchTotalDeltaMs: round(summary.patchTotalMs - baseline.patchTotalMs),
			phaseDeltas: Object.fromEntries(
				phaseNames.map((phase) => [
					phase,
					round((summary.phases[phase] || 0) - (baseline.phases[phase] || 0)),
				]),
			),
		});
	}
	return rows;
};

const formatDelta = (value) => {
	if (value > 0) {
		return `+${value}`;
	}
	return `${value}`;
};

const formatDeltaTable = (rows) => {
	if (!rows.length) {
		return "No baseline deltas available.";
	}
	const phaseNames = [
		...new Set(rows.flatMap((row) => Object.keys(row.phaseDeltas || {}))),
	];
	const normalizedRows = rows.map((row) => ({
		framework: row.framework,
		size: row.size,
		initial_delta_ms: formatDelta(row.initialDeltaMs),
		patch_total_delta_ms: formatDelta(row.patchTotalDeltaMs),
		...Object.fromEntries(
			phaseNames.map((phase) => [
				phase,
				formatDelta(row.phaseDeltas?.[phase] || 0),
			]),
		),
	}));

	const headers = [
		"framework",
		"size",
		"initial_delta_ms",
		"patch_total_delta_ms",
		...phaseNames,
	];
	const widths = Object.fromEntries(
		headers.map((header) => [
			header,
			Math.max(
				header.length,
				...normalizedRows.map((row) => `${row[header] ?? ""}`.length),
			),
		]),
	);

	return [
		headers.map((header) => header.padEnd(widths[header])).join("  "),
		headers.map((header) => "-".repeat(widths[header])).join("  "),
		...normalizedRows.map((row) =>
			headers
				.map((header) => `${row[header] ?? ""}`.padEnd(widths[header]))
				.join("  "),
		),
	].join("\n");
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const playwright = await import("playwright").catch(() => null);
	if (!playwright) {
		console.error(
			"Missing dependency: playwright. Run `npm install` before `npm run bench:editor-tree`.",
		);
		process.exitCode = 1;
		return;
	}

	const server = createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const browser = await playwright.chromium.launch({
		headless: !options.headed,
	});

	try {
		const summaries = [];
		for (const framework of FRAMEWORKS) {
			const runs = [];
			for (let i = 0; i < options.runs; i++) {
				const page = await browser.newPage();
				await page.goto(
					`${baseUrl}/benchmarks/editor-tree/index.html?framework=${framework}`,
					{
						waitUntil: "networkidle",
					},
				);
				await page.waitForFunction(() => window.runEditorTreeBenchmark);
				const result = await page.evaluate(() =>
					window.runEditorTreeBenchmark(),
				);
				runs.push(result);
				await page.close();
			}
			summaries.push(...summarizeRuns(framework, runs));
		}

		const report = {
			meta: {
				generatedAt: new Date().toISOString(),
				runs: options.runs,
				frameworks: FRAMEWORKS,
				sizes: [...new Set(summaries.map((_) => _.size))],
			},
			summary: summaries,
			deltaVsUi: compareToBaseline(summaries, "ui"),
		};

		console.log(
			`Editor tree benchmark (${options.runs} run(s), ui + solidjs, 3 size tiers).\n`,
		);
		console.log(formatSummaryTable(summaries));
		console.log("\nDelta vs ui baseline:");
		console.log(formatDeltaTable(report.deltaVsUi));
		console.log("\nRaw summary:");
		console.log(JSON.stringify(summaries, null, 2));

		if (options.save) {
			await mkdir(RESULTS_DIR, { recursive: true });
			const stamp = isoTimestampForFile(new Date(report.meta.generatedAt));
			const outputPath = path.join(
				RESULTS_DIR,
				`${RESULTS_PREFIX}-${stamp}.json`,
			);
			await writeJson(outputPath, report);
			console.log(
				`\nSaved editor-tree snapshot to ${path.relative(repoRoot, outputPath)}`,
			);
		}
	} finally {
		await browser.close();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
};

await main();
