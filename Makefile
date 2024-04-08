PORT?=8001
TIMESTAMP:=$(shell date +"%Y%m%dT%H%M%S%3N")
SOURCES_JS=$(call get-sources,src/js,js)
SOURCES_CSS=$(call get-sources,src/css,css)
SOURCES_JSON=$(call get-sources,src/json,json)
SOURCES_XML=$(call get-sources,src/xml,xml)
SOURCES_XSL=$(call get-sources,src/xml,xsl)
SOURCES_HTML=$(call get-sources,src/html,html)
EXAMPLES_ALL=$(call get-sources,examples,*)
COMPONENTS_ALL=$(call get-sources,components,*)
SOURCES_ALL=$(foreach T,JS CSS XML XSL JSON HTML,$(SOURCES_$T))
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%) $(EXAMPLES_ALL:%=run/%) $(COMPONENTS_ALL:%=run/%)
DIST_ALL=\
	$(patsubst src/js/%,dist/js/%,$(filter %.js,$(SOURCES_JS)))\
	$(patsubst src/css/%,dist/css/%,$(filter %.css,$(SOURCES_CSS)))\
	$(patsubst src/xml/%,dist/xml/%,$(filter %.xsl,$(SOURCES_XSL)))


# --
# Make commands
get-sources=$(wildcard $1/*.$2 $1/*/*.$2 $1/*/*/*.$2)
use-bin=$1

.PHONY: dist run stats

run: $(RUN_ALL)
	@$(call use-bin,env) -C run $(call use-bin,python) -m http.server $(PORT)

update-css: FORCE  run/.has-cmd-bun run/.has-cmd-prettier
	@for FILE in $(SOURCES_CSS); do
		if [ ! -z "$$(grep @tmpl $$FILE)" ]; then
			bun src/js/ui/ssr/cssgen.js "$$FILE" | prettier --stdin-filepath="$$FILE" --parser css > "$$FILE".tmp
			if [ -e "$$FILE".tmp ]; then
				echo "... File $$FILE updated"
				mv "$$FILE".tmp "$$FILE"
			else
				echo "!!! File $$FILE NOT updated"
			fi
		fi
	done

clean:
	@test -e dist && rm -rf dist
	if [ -e run ]; then
		find run -type l -delete
		find run -type d -empty -delete
		find run -name ".*" -delete
	fi

prep: $(RUN_ALL)
	@

dist: $(DIST_ALL)
	@

dist.tar.gz: $(DIST_ALL)
	@tar cfvz $@ $(DIST_ALL)
	du -h $@

stats: dist
	@echo "Numbers of characters (source): $$(cat $(filter %.js,$(SOURCES_ALL)) | wc -c)"
	echo  "Numbers of characters (dist)  : $$(cat $(DIST_ALL) | wc -c)"
	du -hs dist/css dist/js

fmt:
	@nvim --headless +'ALEFix' +'wq' $(SOURCES_ALL)
	# nvim -u NONE -c 'ALEFix' -c 'wq' <file_name>

run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

run/%: %
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

dist/%: src/%
	@mkdir -p "$(dir $@)"
	cp -a "$<" "$@"

dist/js/%: src/js/% run/.has-npm-uglifyjs
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,uglifyjs) --compress --module --no-annotations --mangle -o "$@" $<

dist/css/%: src/css/% run/.has-npm-uglifycss
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,uglifycss) --ugly-comments --output "$@" $<

src/js/ui/version.js: FORCE
	@mkdir -p "$(dir $@)"
	echo 'export const updated="$(TIMESTAMP)";' > $@

run/.has-npm-%: run/.has-cmd-bun
	@if [ -z "$$(which $* 2> /dev/null)" ]; then
		bun install %
	fi
	if [ -z "$$(which $* 2> /dev/null)" ]; then
		echo "ERR Could not install $*"
		exit 1
	else
		mkdir -p "$(dir $@)"
		touch "$@"
	fi

run/.has-cmd-%:
	@if [ -z "$$(which $* 2> /dev/null)" ]; then
		echo "ERR Could not find command: $*"
		exit 1
	else
		mkdir -p "$(dir $@)"
		touch "$@"
	fi

release: src/js/ui/version.js
	@git add "$<"
	git commit "$<" -m "[Release] Release $(TIMESTAMP)"
	git tag -a "release" -m "Release $(TIMESTAMP)"
	git push origin --tags


print-%:
	@echo $($*)

FORCE:

.ONESHELL:
# EOF
