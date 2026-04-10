import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
};

const FRAMEWORKS = ["preact", "solidjs", "ui-faster"];

const round = (value) => Number(value.toFixed(2));

const compareSnapshots = (baseline, candidate) => {
	const baselineByLabel = new Map(
		(baseline.snapshots || []).map((snapshot) => [snapshot.label, snapshot])
	);
	const candidateByLabel = new Map(
		(candidate.snapshots || []).map((snapshot) => [snapshot.label, snapshot])
	);
	const labels = [...baselineByLabel.keys()];
	const mismatches = [];
	for (const label of labels) {
		const expected = baselineByLabel.get(label);
		const actual = candidateByLabel.get(label);
		if (!actual) {
			mismatches.push({ label, reason: "missing checkpoint" });
			continue;
		}
		if (
			expected.structureHash !== actual.structureHash ||
			expected.textHash !== actual.textHash
		) {
			mismatches.push({
				label,
				reason: "hash mismatch",
				expected: {
					structureHash: expected.structureHash,
					textHash: expected.textHash,
				},
				actual: {
					structureHash: actual.structureHash,
					textHash: actual.textHash,
				},
			});
		}
	}
	return {
		ok: mismatches.length === 0,
		mismatches,
	};
};

const parseArgs = (argv) => {
	const options = {
		runs: 5,
		headed: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--runs" && argv[i + 1]) {
			options.runs = Number.parseInt(argv[++i], 10);
		} else if (arg === "--headed") {
			options.headed = true;
		}
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

const average = (values) =>
	values.length
		? values.reduce((total, value) => total + value, 0) / values.length
		: 0;

const summarizeRuns = (framework, runs) => {
	const phaseNames = runs[0]?.patches.phases.map((phase) => phase.name) || [];
	const phases = Object.fromEntries(
		phaseNames.map((name) => [
			name,
			round(
				average(
					runs.map(
						(run) =>
							run.patches.phases.find((phase) => phase.name === name)?.totalDuration || 0
					)
				)
			),
		])
	);
	return {
		framework,
		runs: runs.length,
		logs: runs[0]?.dataset.logCount || 0,
		initialMs: round(average(runs.map((run) => run.initial.duration))),
		patchTotalMs: round(
			average(runs.map((run) => run.patches.totalDuration))
		),
		nodeCount: round(average(runs.map((run) => run.initial.nodeCount))),
		phases,
	};
};

const summarizeVerification = (results) =>
	results.map((result) => ({
		framework: result.framework,
		ok: result.ok,
		mismatches: result.mismatches.length,
		firstMismatch: result.mismatches[0] || null,
	}));

const formatSummaryTable = (summaries) => {
	const phaseNames = [...new Set(summaries.flatMap((summary) => Object.keys(summary.phases)))];
	const rows = summaries.map((summary) => ({
		framework: summary.framework,
		initialMs: `${summary.initialMs}`,
		patchTotalMs: `${summary.patchTotalMs}`,
		nodeCount: `${summary.nodeCount}`,
		...Object.fromEntries(phaseNames.map((name) => [name, `${summary.phases[name] ?? 0}`])),
	}));
	const headers = ["framework", "initialMs", "patchTotalMs", ...phaseNames, "nodeCount"];
	const widths = Object.fromEntries(
		headers.map((header) => [
			header,
			Math.max(
				header.length,
				...rows.map((row) => `${row[header] ?? ""}`.length)
			),
		])
	);
	return [
		headers.map((header) => header.padEnd(widths[header])).join("  "),
		headers.map((header) => "-".repeat(widths[header])).join("  "),
		...rows.map((row) =>
			headers
				.map((header) => `${row[header] ?? ""}`.padEnd(widths[header]))
				.join("  ")
		),
	].join("\n");
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const playwright = await import("playwright").catch(() => null);
	if (!playwright) {
		console.error(
			"Missing dependency: playwright. Run `npm install` before `npm run bench:inspector`."
		);
		process.exitCode = 1;
		return;
	}

	const server = createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const browser = await playwright.chromium.launch({ headless: !options.headed });

	try {
		const summaries = [];
		const verificationRuns = [];
		for (const framework of FRAMEWORKS) {
			const runs = [];
			for (let i = 0; i < options.runs; i++) {
				const page = await browser.newPage();
				await page.goto(
					`${baseUrl}/benchmarks/inspector/index.html?framework=${framework}`,
					{ waitUntil: "networkidle" }
				);
				await page.waitForFunction(() => window.runInspectorBenchmark);
				const result = await page.evaluate(() => window.runInspectorBenchmark());
				runs.push(result);
				await page.close();
			}
			summaries.push(summarizeRuns(framework, runs));

			const verificationPage = await browser.newPage();
			await verificationPage.goto(
				`${baseUrl}/benchmarks/inspector/index.html?framework=${framework}`,
				{ waitUntil: "networkidle" }
			);
			await verificationPage.waitForFunction(() => window.runInspectorBenchmark);
			const verification = await verificationPage.evaluate(() =>
				window.runInspectorBenchmark({ captureSnapshots: true })
			);
			verificationRuns.push(verification);
			await verificationPage.close();
		}

		const baseline = verificationRuns.find((result) => result.framework === "preact");
		const verificationSummary = verificationRuns.map((result) => ({
			framework: result.framework,
			...compareSnapshots(baseline, result),
		}));

		console.log(
			`Inspector benchmark across ${summaries[0]?.logs || 0} logs, ${options.runs} run(s) per framework.\n`
		);
		console.log(formatSummaryTable(summaries));
		console.log("\nVerification:");
		console.log(JSON.stringify(summarizeVerification(verificationSummary), null, 2));
		console.log("\nRaw summary:");
		console.log(JSON.stringify(summaries, null, 2));
	} finally {
		await browser.close();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	}
};

await main();
