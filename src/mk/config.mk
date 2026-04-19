BENCH_UIJS_SRC:=tests/bench/uijs
BENCH_UIJS_DST:=deps/js-framework-benchmark/frameworks/keyed/uijs
BENCH_UIJS_LINK_TASK:=$(PATH_BUILD)/tasks/bench-uijs-link.task
JS_BUNDLE_ENTRY?=src/js/ui.js

PREP_ALL+=$(BENCH_UIJS_LINK_TASK)
