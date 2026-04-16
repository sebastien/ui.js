$(BENCH_UIJS_LINK_TASK): .FORCE $(BENCH_UIJS_SRC)/index.html
	mkdir -p "$(dir $(BENCH_UIJS_DST))" "$(dir $@)"
	rm -rf "$(BENCH_UIJS_DST)"
	ln -sfr "$(BENCH_UIJS_SRC)" "$(BENCH_UIJS_DST)"
	touch "$@"

.PHONY: bench-prep
bench-prep: $(BENCH_UIJS_LINK_TASK) ## Prepares js-framework-benchmark fixtures
