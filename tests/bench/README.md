# Bench Suite

This directory contains benchmark tooling that compares `ui.js` with the official JS Framework Benchmark harness.

## Commands

- `npm run bench`
- `npm run bench -- --count 5`
- `npm run bench -- --headed`
- `npm run bench -- --bench 01_run1k 02_replace1k`
- `npm run bench -- --full`
- `npm run bench -- --save --tag before-vdom-opt`
- `npm run bench -- --out tests/bench/js-framework-benchmark/results/custom.json`
- `npm run bench -- --count 5 --save --tag baseline`
- `npm run bench -- --count 5 --save --tag after-change`
- `npm run bench:diff -- tests/data/benchmark-OLD.json tests/data/benchmark-NEW.json`

By default, `npm run bench` runs:

- Frameworks: `keyed/uijs`, `keyed/solid`, `keyed/preact-hooks`
- Benchmarks: CPU suite (`01_*` through `09_*`)
- Runner: official JS Framework Benchmark `webdriver-ts` with Playwright
- Browser: Chrome headless

## Output

- Console table with one row per framework, one column per benchmark, plus:
  - `score`: geometric mean of selected benchmark medians (lower is better)
  - `vs preact`: relative score against `preact-hooks` baseline
- Machine-readable report at `tests/bench/js-framework-benchmark/results/latest.json`
- Time-series data file at `tests/data/benchmark-YYYYMMDDHHMMSS.json` (written every run)
- Optional timestamped snapshots in `tests/bench/js-framework-benchmark/results/history/` when `--save` is used

## Compare Runs

- Fastest way: compare `progress` in `tests/bench/js-framework-benchmark/results/latest.json` after a second run.
- Snapshot-by-snapshot: open two files from `tests/data/benchmark-*.json` and compare:
  - `comparison.frameworks.uijs.aggregates.totalGeomean`
  - `comparison.frameworks.uijs.vsBaseline.totalGeomean`
  - `comparison.frameworks.uijs.benchmarks.<benchmark>.total`
- Interpretation:
  - Lower `total` and `totalGeomean` is better.
  - `vsBaseline` below `1.0` means faster than `preact-hooks` for that metric.
  - In `progress`, negative delta % is an improvement, positive is a regression.
- CLI diff helper:
  - `npm run bench:diff -- tests/data/benchmark-OLD.json tests/data/benchmark-NEW.json`
  - `npm run bench:diff` (auto-picks the two latest `tests/data/benchmark-*.json` files)
  - Prints aggregate and per-benchmark deltas for `ui.js`, `SolidJS`, and `Preact`, plus cross-framework ratios.

### JSON shape

- `meta`: run metadata (`generatedAt`, `tag`, `count`, browser, selected benchmarks)
- `comparison.frameworks.<framework>.benchmarks.<benchmark>`:
  - `total`, `script`, `paint` (median values when available)
- `comparison.frameworks.<framework>.aggregates`:
  - `totalGeomean`, `scriptGeomean`, `paintGeomean`
- `comparison.frameworks.<framework>.vsBaseline`:
  - per-benchmark and aggregate ratios against `preact-hooks`
- `progress` (when history exists): delta % for `uijs` versus previous snapshot

## Notes

- The script auto-installs JS Framework Benchmark dependencies on first run.
- The `uijs` framework implementation lives in `deps/js-framework-benchmark/frameworks/keyed/uijs`.
- Recommended workflow for tracking progress:
  1. `npm run bench -- --count 5 --save --tag baseline`
  2. optimize `ui.js`
  3. `npm run bench -- --count 5 --save --tag after-change`
  4. inspect `progress` in `tests/bench/js-framework-benchmark/results/latest.json`
  5. keep historical snapshots in `tests/data/benchmark-*.json`
