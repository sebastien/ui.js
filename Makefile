PORT?=8001
SOURCES_ALL=$(wildcard src/*/*.* src/*/*/*.* src/*/*/*/*.*)
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%)

run: $(RUN_ALL)
	@env -C run python -m http.server $(PORT)

run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

# fmt:
# 	nvim -u NONE -c 'ALEFix' -c 'wq' <file_name>
# 	@nvim --headless +'ALEFix' +'wq' $(SUORCES_ALL)

print-%:
	@echo $($*)

.ONESHELL:
# EOF
