import { BASELINE, BENCHMARK_LABELS, FRAMEWORKS } from "./config.mjs";

const round = (value, digits = 4) =>
	Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

const geometricMean = (values) => {
	const positives = values.filter(
		(value) => Number.isFinite(value) && value > 0,
	);
	if (!positives.length) {
		return null;
	}
	const sum = positives.reduce((total, value) => total + Math.log(value), 0);
	return Math.exp(sum / positives.length);
};

const frameworkNameFromResult = (framework) => {
	const withoutKeyed = framework.replace(/-(keyed|non-keyed)$/u, "");
	return withoutKeyed.replace(/-v.+$/u, "");
};

const benchmarkMetricsFromEntry = (entry) => {
	const total =
		entry.values?.DEFAULT?.median ?? entry.values?.total?.median ?? null;
	const script = entry.values?.script?.median ?? null;
	const paint = entry.values?.paint?.median ?? null;
	return {
		total: Number.isFinite(total) ? total : null,
		script: Number.isFinite(script) ? script : null,
		paint: Number.isFinite(paint) ? paint : null,
	};
};

const createFrameworkReport = (framework, selectedBenchmarks) => {
	const benchmarkValues = Object.fromEntries(
		selectedBenchmarks.map((benchmark) => [
			benchmark,
			{ total: null, script: null, paint: null },
		]),
	);

	return {
		framework,
		keyed: true,
		benchmarks: benchmarkValues,
		aggregates: {
			totalGeomean: null,
			scriptGeomean: null,
			paintGeomean: null,
		},
		vsBaseline: {
			totalGeomean: null,
			scriptGeomean: null,
			paintGeomean: null,
			benchmarks: Object.fromEntries(
				selectedBenchmarks.map((benchmark) => [
					benchmark,
					{ total: null, script: null, paint: null },
				]),
			),
		},
	};
};

const fillAggregates = (framework, selectedBenchmarks) => {
	const totals = [];
	const scripts = [];
	const paints = [];

	for (const benchmark of selectedBenchmarks) {
		const metric = framework.benchmarks[benchmark];
		if (Number.isFinite(metric.total)) {
			totals.push(metric.total);
		}
		if (Number.isFinite(metric.script)) {
			scripts.push(metric.script);
		}
		if (Number.isFinite(metric.paint)) {
			paints.push(metric.paint);
		}
	}

	framework.aggregates.totalGeomean = round(geometricMean(totals));
	framework.aggregates.scriptGeomean = round(geometricMean(scripts));
	framework.aggregates.paintGeomean = round(geometricMean(paints));
};

const fillRatios = (framework, baseline, selectedBenchmarks) => {
	for (const benchmark of selectedBenchmarks) {
		for (const metric of ["total", "script", "paint"]) {
			const value = framework.benchmarks[benchmark][metric];
			const ref = baseline.benchmarks[benchmark][metric];
			framework.vsBaseline.benchmarks[benchmark][metric] =
				Number.isFinite(value) && Number.isFinite(ref) && ref > 0
					? round(value / ref)
					: null;
		}
	}

	for (const metric of ["totalGeomean", "scriptGeomean", "paintGeomean"]) {
		const value = framework.aggregates[metric];
		const ref = baseline.aggregates[metric];
		framework.vsBaseline[metric] =
			Number.isFinite(value) && Number.isFinite(ref) && ref > 0
				? round(value / ref)
				: null;
	}
};

export const buildComparisonReport = (entries, selectedBenchmarks) => {
	const knownFrameworks = Object.values(FRAMEWORKS).map((frameworkPath) => {
		const segments = frameworkPath.split("/");
		return segments[segments.length - 1];
	});
	const byFramework = new Map(
		knownFrameworks.map((framework) => [
			framework,
			createFrameworkReport(framework, selectedBenchmarks),
		]),
	);

	for (const entry of entries) {
		if (!selectedBenchmarks.includes(entry.benchmark)) {
			continue;
		}
		const framework = frameworkNameFromResult(entry.framework);
		if (!byFramework.has(framework)) {
			continue;
		}
		const report = byFramework.get(framework);
		report.keyed = entry.keyed;
		report.benchmarks[entry.benchmark] = benchmarkMetricsFromEntry(entry);
	}

	for (const framework of byFramework.values()) {
		fillAggregates(framework, selectedBenchmarks);
	}

	const baseline = byFramework.get(BASELINE);
	if (baseline) {
		for (const framework of byFramework.values()) {
			fillRatios(framework, baseline, selectedBenchmarks);
		}
	}

	const frameworks = Object.fromEntries(
		[...byFramework.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([name, value]) => [name, value]),
	);

	return {
		comparison: {
			baseline: BASELINE,
			frameworks,
		},
	};
};

const formatMetric = (value, digits = 1) =>
	Number.isFinite(value) ? `${value.toFixed(digits)}` : "n/a";

export const formatTable = (frameworksMap, selectedBenchmarks) => {
	const frameworks = Object.values(frameworksMap);
	const benchmarkColumns = selectedBenchmarks.map((benchmark) => ({
		id: benchmark,
		label: BENCHMARK_LABELS[benchmark] || benchmark,
	}));

	const rows = frameworks.map((framework) => ({
		framework: framework.framework,
		...Object.fromEntries(
			benchmarkColumns.map(({ id }) => [
				id,
				formatMetric(framework.benchmarks[id]?.total, 1),
			]),
		),
		score: formatMetric(framework.aggregates.totalGeomean, 1),
		vsPreact: Number.isFinite(framework.vsBaseline.totalGeomean)
			? `${(framework.vsBaseline.totalGeomean * 100).toFixed(1)}%`
			: "n/a",
	}));

	const headers = [
		"framework",
		...benchmarkColumns.map((_) => _.label),
		"score",
		"vs preact",
	];
	const rowKeys = [
		"framework",
		...benchmarkColumns.map((_) => _.id),
		"score",
		"vsPreact",
	];

	const widths = Object.fromEntries(
		headers.map((header, index) => {
			const key = rowKeys[index];
			return [
				key,
				Math.max(
					header.length,
					...rows.map((row) => `${row[key] ?? ""}`.length),
				),
			];
		}),
	);

	const headerRow = headers
		.map((header, index) => header.padEnd(widths[rowKeys[index]]))
		.join("  ");
	const divider = rowKeys.map((key) => "-".repeat(widths[key])).join("  ");
	const lines = rows.map((row) =>
		rowKeys.map((key) => `${row[key] ?? ""}`.padEnd(widths[key])).join("  "),
	);

	return [headerRow, divider, ...lines].join("\n");
};

export const computeProgressDelta = (
	currentOutput,
	previousOutput,
	focusFramework = "uijs",
) => {
	const current = currentOutput?.comparison?.frameworks?.[focusFramework];
	const previous = previousOutput?.comparison?.frameworks?.[focusFramework];
	if (!current || !previous) {
		return null;
	}

	const benchmarkDeltaPct = {};
	const benchmarkIds = Object.keys(current.benchmarks || {});
	for (const benchmark of benchmarkIds) {
		benchmarkDeltaPct[benchmark] = {};
		for (const metric of ["total", "script", "paint"]) {
			const now = current.benchmarks[benchmark]?.[metric];
			const prev = previous.benchmarks?.[benchmark]?.[metric];
			benchmarkDeltaPct[benchmark][metric] =
				Number.isFinite(now) && Number.isFinite(prev) && prev !== 0
					? round(((now - prev) / prev) * 100, 2)
					: null;
		}
	}

	const aggregateDeltaPct = {};
	for (const metric of ["totalGeomean", "scriptGeomean", "paintGeomean"]) {
		const now = current.aggregates?.[metric];
		const prev = previous.aggregates?.[metric];
		aggregateDeltaPct[metric] =
			Number.isFinite(now) && Number.isFinite(prev) && prev !== 0
				? round(((now - prev) / prev) * 100, 2)
				: null;
	}

	return {
		framework: focusFramework,
		against: previousOutput?.meta?.generatedAt || null,
		tag: previousOutput?.meta?.tag || null,
		aggregateDeltaPct,
		benchmarkDeltaPct,
	};
};
