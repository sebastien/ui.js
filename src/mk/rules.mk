BENCH_DIR:=deps/js-framework-benchmark
BENCH_REPO:=https://github.com/krausest/js-framework-benchmark.git

$(BENCH_UIJS_LINK_TASK): .FORCE $(BENCH_UIJS_SRC)/index.html
	mkdir -p "$(dir $(BENCH_UIJS_DST))" "$(dir $@)"
	rm -rf "$(BENCH_UIJS_DST)"
	ln -sfr "$(BENCH_UIJS_SRC)" "$(BENCH_UIJS_DST)"
	touch "$@"

# Prep: JS Framework Benchmark dependencies
$(BENCH_DIR)/server/node_modules/.package-lock.json:
	@echo "Cloning js-framework-benchmark..."
	rm -rf "$(BENCH_DIR)"
	git clone --depth 1 "$(BENCH_REPO)" "$(BENCH_DIR)"
	@cd "$(BENCH_DIR)/server" && npm install

PREP_BENCH := $(BENCH_DIR)/server/node_modules/.package-lock.json
PROJECT_DIR := $(shell pwd)
BENCH_PID_FILE := $(PROJECT_DIR)/.bench-server.pid

.PHONY: prep-bench
prep-bench: $(PREP_BENCH) ## Ensure JS Framework Benchmark dependencies are installed
	rm -rf "$(BENCH_DIR)/frameworks/keyed/uijs"
	ln -sfr "$(PROJECT_DIR)/tests/bench/uijs" "$(BENCH_DIR)/frameworks/keyed/uijs"
	cd "$(PROJECT_DIR)/$(BENCH_DIR)/webdriver-ts-results" && npm install
	rm -rf "$(PROJECT_DIR)/$(BENCH_DIR)/webdriver-ts/node_modules" "$(PROJECT_DIR)/$(BENCH_DIR)/webdriver-ts/dist"
	cd "$(PROJECT_DIR)/$(BENCH_DIR)/webdriver-ts" && npm ci --ignore-scripts && npm run compile

.PHONY: bench-server-start
bench-server-start: prep-bench ## Start benchmark server (port 8080)
	cd "$(PROJECT_DIR)/$(BENCH_DIR)/server" && nohup npm start > /dev/null 2>&1 & \
		echo $$! > "$(BENCH_PID_FILE)"
	@echo "Waiting for server to start..."
	@sleep 3

.PHONY: bench-server-stop
bench-server-stop: ## Stop benchmark server
	@-if [ -f "$(BENCH_PID_FILE)" ]; then \
		kill $$(cat "$(BENCH_PID_FILE)") 2>/dev/null; \
		rm -f "$(BENCH_PID_FILE)"; \
	fi

.PHONY: bench
bench: bench-server-start ## Run JS Framework Benchmark
	@cd "$(PROJECT_DIR)/tests/bench/js-framework-benchmark" && node run.mjs --count 3 || true
	-@pkill -f "tsx index.ts" 2>/dev/null || true
	@$(MAKE) bench-summary

.PHONY: bench-summary
bench-summary: ## Display benchmark results summary
	node "$(PROJECT_DIR)/scripts/bench-summary.mjs"
