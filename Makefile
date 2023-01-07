PORT?=8001
SOURCES_ALL=$(wildcard src/**/*.*)
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%) run/lib/js/select.js

run: $(RUN_ALL)
	@env -C run python -m http.server $(PORT)

run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

run/lib/js/select.js:
	@mkdir -p "$(dir $@)"
	curl -o "$@" "https://cdn.jsdelivr.net/gh/sebastien/select.js@4d3fbfc82966557c6d04e4237905529bbe98740d/src/js/select.js"

print-%:
	@echo $($*)

.ONESHELL:
# EOF
