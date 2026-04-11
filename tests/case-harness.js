export const nextFrame = () =>
	new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const settle = async (frames = 2) => {
	for (let i = 0; i < frames; i++) {
		await nextFrame();
	}
};

export const measure = async (fn) => {
	const startedAt = performance.now();
	const value = await fn();
	return {
		duration: performance.now() - startedAt,
		value,
	};
};

export const countDomNodes = (root) => {
	let count = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
	while (walker.nextNode()) {
		count += 1;
	}
	return count;
};

export const percentile = (values, ratio) => {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
	return sorted[index];
};

export const p75 = (values) => percentile(values, 0.75);
export const p95 = (values) => percentile(values, 0.95);

const round = (value) => Number(value.toFixed(2));

export const summarizeRuns = (caseName, runs, pickMetrics) => {
	const mounted = runs.map((run) => run.mount_time_ms);
	const interactions = runs.map((run) => run.interaction_total_ms);
	const extra = pickMetrics ? pickMetrics(runs) : {};
	return {
		case: caseName,
		runs: runs.length,
		mount_time_ms: round(p75(mounted)),
		interaction_total_ms: round(p75(interactions)),
		mount_p95_ms: round(p95(mounted)),
		interaction_p95_ms: round(p95(interactions)),
		...extra,
	};
};

export const printMetrics = (caseName, result) => {
	console.group(`[case benchmark] ${caseName}`);
	console.table([result]);
	console.log(JSON.stringify(result, null, 2));
	console.groupEnd();
};
