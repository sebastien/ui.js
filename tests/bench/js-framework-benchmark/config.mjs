export const FRAMEWORKS = {
	uijs: "keyed/uijs",
	solid: "keyed/solid",
	preact: "keyed/preact-hooks",
};

export const BASELINE = "preact-hooks";

export const DEFAULT_BENCHMARKS = [
	"01_run1k",
	"02_replace1k",
	"03_update10th1k_x16",
	"04_select1k",
	"05_swap1k",
	"06_remove-one-1k",
	"07_create10k",
	"08_create1k-after1k_x2",
	"09_clear1k_x8",
];

export const EXTENDED_BENCHMARKS = [
	"21_ready-memory",
	"22_run-memory",
	"25_run-clear-memory",
	"30_startup",
	"40_sizes",
];

export const BENCHMARK_LABELS = {
	"01_run1k": "create 1k",
	"02_replace1k": "replace 1k",
	"03_update10th1k_x16": "update 10th",
	"04_select1k": "select",
	"05_swap1k": "swap",
	"06_remove-one-1k": "remove",
	"07_create10k": "create 10k",
	"08_create1k-after1k_x2": "append 1k",
	"09_clear1k_x8": "clear",
	"21_ready-memory": "mem ready",
	"22_run-memory": "mem run",
	"25_run-clear-memory": "mem cycle",
	"30_startup": "startup",
	"40_sizes": "size",
};

export const JSFB_ROOT = "deps/js-framework-benchmark";
export const JSFB_SERVER_DIR = `${JSFB_ROOT}/server`;
export const JSFB_WEBDRIVER_DIR = `${JSFB_ROOT}/webdriver-ts`;
export const JSFB_FRAMEWORKS_DIR = `${JSFB_ROOT}/frameworks/keyed`;

export const RESULTS_DIR = "tests/bench/js-framework-benchmark/results";
export const RESULTS_FILE = `${RESULTS_DIR}/latest.json`;
export const RESULTS_HISTORY_DIR = `${RESULTS_DIR}/history`;
export const DATA_RESULTS_DIR = "tests/data";
export const DATA_RESULTS_PREFIX = "benchmark";
