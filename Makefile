PORT?=8001
SOURCES_ALL=$(wildcard src/*/*.* src/*/*/*.* src/*/*/*/*.*)
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%)
DIST_ALL=$(patsubst src/js/%,dist/%,$(filter %.js,$(SOURCES_ALL)))

use-bin=$1

.PHONY: dist run stats

run: $(RUN_ALL)
	@$(call use-bin,env) -C run $(call use-bin,python) -m http.server $(PORT)

dist: $(DIST_ALL)
run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

dist/%: src/js/%
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,terser) --compress -- $< > $@

stats: dist
	@echo "Numbers of characters (source): $$(cat $(filter %.js,$(SOURCES_ALL)) | wc -c)"
	echo  "Numbers of characters (dist)  : $$(cat $(DIST_ALL) | wc -c)"

# fmt:
# 	nvim -u NONE -c 'ALEFix' -c 'wq' <file_name>
# 	@nvim --headless +'ALEFix' +'wq' $(SUORCES_ALL)

print-%:
	@echo $($*)

.ONESHELL:
# EOF
