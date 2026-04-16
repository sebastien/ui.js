import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	DEFAULT_BENCHMARKS,
	EXTENDED_BENCHMARKS,
	FRAMEWORKS,
	JSFB_ROOT,
	JSFB_SERVER_DIR,
	JSFB_WEBDRIVER_DIR,
	RESULTS_DIR,
	RESULTS_FILE,
	RESULTS_HISTORY_DIR,
	DATA_RESULTS_DIR,
	DATA_RESULTS_PREFIX,
	DATA_FRAMEWORKS_RESULTS_PREFIX,
} from "./config.mjs";
import {
	buildComparisonReport,
	computeProgressDelta,
	formatTable,
} from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const slugify = (value) =>
	`${value}`
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "run";

const isoTimestampForFile = (date = new Date()) => {
	const pad = (value) => `${value}`.padStart(2, "0");
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
};

const parseArgs = (argv) => {
	const options = {
		count: 3,
		headless: true,
		browser: "chrome",
		full: false,
		benches: [],
		save: false,
		tag: null,
		out: RESULTS_FILE,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--count" && argv[i + 1]) {
			options.count = Number.parseInt(argv[++i], 10);
		} else if (arg === "--browser" && argv[i + 1]) {
			options.browser = argv[++i];
		} else if (arg === "--headless") {
			options.headless = true;
		} else if (arg === "--headed") {
			options.headless = false;
		} else if (arg === "--full") {
			options.full = true;
		} else if (arg === "--save") {
			options.save = true;
		} else if (arg === "--tag" && argv[i + 1]) {
			options.tag = argv[++i];
		} else if (arg === "--out" && argv[i + 1]) {
			options.out = argv[++i];
		} else if (arg === "--bench") {
			while (argv[i + 1] && !argv[i + 1].startsWith("--")) {
				options.benches.push(argv[++i]);
			}
		}
	}

	if (!Number.isFinite(options.count) || options.count <= 0) {
		throw new Error("--count must be a positive integer");
	}

	return options;
};

const runCommand = ({ command, args, cwd, env, quiet = false }) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
		});

		let stdout = "";
		let stderr = "";
		if (quiet && child.stdout && child.stderr) {
			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
		}

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve({ code, stdout, stderr });
			} else {
				reject(
					new Error(
						`Command failed (${code}): ${command} ${args.join(" ")}\n${stderr || stdout}`,
					),
				);
			}
		});
	});

const fileExists = async (filePath) => {
	try {
		await readFile(filePath);
		return true;
	} catch {
		return false;
	}
};

const waitForHttp = async (url, timeoutMs = 60_000) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Ignore transient startup failures.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Timeout waiting for ${url}`);
};

const ensureJsfbInstalled = async () => {
	const serverModules = path.join(repoRoot, JSFB_SERVER_DIR, "node_modules");
	const webdriverDist = path.join(
		repoRoot,
		JSFB_WEBDRIVER_DIR,
		"dist",
		"benchmarkRunner.js",
	);
	const hasServerModules = await fileExists(
		path.join(serverModules, ".package-lock.json"),
	);
	const hasWebdriverDist = await fileExists(webdriverDist);

	if (!hasServerModules || !hasWebdriverDist) {
		console.log("Installing JS Framework Benchmark dependencies...");
		await runCommand({
			command: "npm",
			args: ["run", "install-local"],
			cwd: path.join(repoRoot, JSFB_ROOT),
		});
	}
};

const buildFramework = async (frameworkDir) => {
	const cwd = path.join(repoRoot, JSFB_ROOT, "frameworks", frameworkDir);
	await runCommand({ command: "npm", args: ["ci"], cwd, quiet: true });
	await runCommand({ command: "npm", args: ["run", "build-prod"], cwd });
};

const startServer = async () => {
	const cwd = path.join(repoRoot, JSFB_SERVER_DIR);
	const child = spawn("npm", ["run", "start"], {
		cwd,
		env: process.env,
		stdio: "inherit",
	});
	await waitForHttp("http://localhost:8080/ls");
	return child;
};

const stopServer = async (child) => {
	if (!child || child.killed) {
		return;
	}
	await new Promise((resolve) => {
		let resolved = false;
		const done = () => {
			if (!resolved) {
				resolved = true;
				resolve();
			}
		};

		child.once("close", () => done());
		child.kill("SIGINT");
		setTimeout(() => {
			if (!child.killed) {
				child.kill("SIGKILL");
			}
			done();
		}, 5000);
	});
};

const readJson = async (filePath) =>
	JSON.parse(await readFile(filePath, "utf8"));

const readResultEntries = async (resultDir) => {
	const files = (await readdir(resultDir)).filter((file) =>
		file.endsWith(".json"),
	);
	const entries = [];
	for (const file of files) {
		entries.push(await readJson(path.join(resultDir, file)));
	}
	return entries;
};

const getLatestHistoryFile = async (historyDir) => {
	let files;
	try {
		files = (await readdir(historyDir))
			.filter((file) => file.endsWith(".json"))
			.sort();
	} catch {
		return null;
	}
	if (!files.length) {
		return null;
	}
	return path.join(historyDir, files[files.length - 1]);
};

const writeJsonFile = async (filePath, value) => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const selectedBenchmarks = options.benches.length
		? options.benches
		: [...DEFAULT_BENCHMARKS, ...(options.full ? EXTENDED_BENCHMARKS : [])];

	const resultDir = path.join(repoRoot, JSFB_WEBDRIVER_DIR, "results");
	const latestOutputPath = path.resolve(repoRoot, options.out);
	const historyDirPath = path.resolve(repoRoot, RESULTS_HISTORY_DIR);
	const dataResultsDirPath = path.resolve(repoRoot, DATA_RESULTS_DIR);

	await mkdir(path.join(repoRoot, RESULTS_DIR), { recursive: true });
	await mkdir(historyDirPath, { recursive: true });
	await mkdir(dataResultsDirPath, { recursive: true });

	let previousOutput = null;
	const latestHistoryPath = await getLatestHistoryFile(historyDirPath);
	if (latestHistoryPath) {
		try {
			previousOutput = await readJson(latestHistoryPath);
		} catch {
			previousOutput = null;
		}
	}

	await ensureJsfbInstalled();

	console.log("Building benchmark frameworks...");
	await buildFramework(FRAMEWORKS.uijs);
	await buildFramework(FRAMEWORKS.solid);
	await buildFramework(FRAMEWORKS.preact);

	await rm(resultDir, { recursive: true, force: true });
	await mkdir(resultDir, { recursive: true });

	let server;
	try {
		console.log("Starting JS Framework Benchmark server...");
		server = await startServer();

		const args = [
			"dist/benchmarkRunner.js",
			"--runner",
			"playwright",
			"--browser",
			options.browser,
			"--count",
			`${options.count}`,
			"--framework",
			FRAMEWORKS.uijs,
			FRAMEWORKS.solid,
			FRAMEWORKS.preact,
			"--benchmark",
			...selectedBenchmarks,
		];

		if (options.headless) {
			args.push("--headless");
		}

		console.log("Running benchmarks...");
		await runCommand({
			command: "node",
			args,
			cwd: path.join(repoRoot, JSFB_WEBDRIVER_DIR),
			env: { LANG: "en_US.UTF-8" },
		});
	} finally {
		await stopServer(server);
	}

	const entries = await readResultEntries(resultDir);
	const report = buildComparisonReport(entries, selectedBenchmarks);
	const generatedAt = new Date().toISOString();
	const output = {
		meta: {
			generatedAt,
			tag: options.tag,
			count: options.count,
			browser: options.browser,
			headless: options.headless,
			benchmarks: selectedBenchmarks,
		},
		...report,
	};

	const progress = computeProgressDelta(output, previousOutput, "uijs");
	if (progress) {
		output.progress = progress;
	}

	console.log(
		`\nJS Framework Benchmark (${options.count} run(s), ${selectedBenchmarks.length} benchmark(s), baseline: preact-hooks)\n`,
	);
	console.log(formatTable(output.comparison.frameworks, selectedBenchmarks));

	await writeJsonFile(latestOutputPath, output);
	console.log(`\nSaved report to ${path.relative(repoRoot, latestOutputPath)}`);
	const dataStamp = generatedAt.replace(/[-:TZ.]/g, "").slice(0, 14);
	const dataResultPath = path.join(
		dataResultsDirPath,
		`${DATA_RESULTS_PREFIX}-${dataStamp}.json`,
	);
	await writeJsonFile(dataResultPath, output);
	console.log(
		`Saved data snapshot to ${path.relative(repoRoot, dataResultPath)}`,
	);

	const frameworksDataPath = path.join(
		dataResultsDirPath,
		`${DATA_FRAMEWORKS_RESULTS_PREFIX}-${dataStamp}.json`,
	);
	await writeJsonFile(frameworksDataPath, entries);
	console.log(
		`Saved frameworks data to ${path.relative(repoRoot, frameworksDataPath)}`,
	);

	if (options.save) {
		const stamp = isoTimestampForFile(new Date(generatedAt));
		const tag = options.tag ? `--${slugify(options.tag)}` : "";
		const historyPath = path.join(historyDirPath, `${stamp}${tag}.json`);
		await writeJsonFile(historyPath, output);
		console.log(
			`Saved history snapshot to ${path.relative(repoRoot, historyPath)}`,
		);
	}
};

await main();
