PORT?=8001
SOURCES_ALL=$(wildcard src/*/*.* src/*/*/*.* src/*/*/*/*.*)
EXAMPLES_ALL=$(wildcard examples/*.* examples/*/*.*)
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%) $(EXAMPLES_ALL:%=run/%)
DIST_ALL=$(patsubst src/js/%,dist/%,$(filter %.js,$(SOURCES_ALL)))

use-bin=$1

.PHONY: dist run stats

run: $(RUN_ALL)
	@$(call use-bin,env) -C run $(call use-bin,python) -m http.server $(PORT)

prep: $(RUN_ALL)
	@

dist: $(DIST_ALL)
	@

run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

run/%: %
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

dist/%: src/js/%
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,terser) --compress -- $< > $@

stats: dist
	@echo "Numbers of characters (source): $$(cat $(filter %.js,$(SOURCES_ALL)) | wc -c)"
	echo  "Numbers of characters (dist)  : $$(cat $(DIST_ALL) | wc -c)"

fmt:
	@nvim --headless +'ALEFix' +'wq' $(SUORCES_ALL)
	# nvim -u NONE -c 'ALEFix' -c 'wq' <file_name>

print-%:
	@echo $($*)

.ONESHELL:
# EOF
