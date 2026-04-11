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

const CASES = [
	{ name: "todolist", page: "/tests/case-todolist.html" },
	{ name: "color_palette", page: "/tests/case-color_palette.html" },
	{ name: "rich_text", page: "/tests/case-rich_text.html" },
	{ name: "data_table", page: "/tests/case-data_table.html" },
	{ name: "form_validation", page: "/tests/case-form_validation.html" },
];

const parseArgs = (argv) => {
	const options = {
		runs: 8,
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

const formatSummaryTable = (rows) => {
	const headers = [
		"case",
		"runs",
		"mount_time_ms",
		"interaction_total_ms",
		"mount_p95_ms",
		"interaction_p95_ms",
		"dom_nodes_before",
		"dom_nodes_after",
	];
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

const runCase = async (browser, baseUrl, entry, runs) => {
	const page = await browser.newPage();
	try {
		await page.goto(`${baseUrl}${entry.page}?runs=${runs}`, {
			waitUntil: "networkidle",
		});
		await page.waitForFunction(() => window.runCaseBenchmark);
		const summary = await page.evaluate(() => window.runCaseBenchmark());
		return summary;
	} finally {
		await page.close();
	}
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const playwright = await import("playwright").catch(() => null);
	if (!playwright) {
		console.error(
			"Missing dependency: playwright. Run `npm install` before `npm run bench:cases`."
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
		for (const entry of CASES) {
			const summary = await runCase(browser, baseUrl, entry, options.runs);
			summaries.push(summary);
		}

		console.log(
			`Case benchmarks consolidated report (${options.runs} run(s) per case).\n`
		);
		console.log(formatSummaryTable(summaries));
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
