PORT?=8001
SOURCES_JS=$(call get-sources,src/js,js)
SOURCES_CSS=$(call get-sources,src/css,css)
SOURCES_XML=$(call get-sources,src/xml,xml)
SOURCES_XSL=$(call get-sources,src/xml,xsl)
SOURCES_HTML=$(call get-sources,src/html,html)
EXAMPLES_ALL=$(call get-sources,examples,*)
SOURCES_ALL=$(foreach T,JS CSS XML XSL HTML,$(SOURCES_$T))
RUN_ALL=$(SOURCES_ALL:src/%=run/lib/%) $(EXAMPLES_ALL:%=run/%)
DIST_ALL=\
	$(patsubst src/js/%,dist/%,$(filter %.js,$(SOURCES_JS)))\
	$(patsubst src/css/%,dist/%,$(filter %.css,$(SOURCES_CSS)))\
	$(patsubst src/xml/%,dist/%,$(filter %.xsl,$(SOURCES_XSL)))


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

fmt:
	@nvim --headless +'ALEFix' +'wq' $(SOURCES_ALL)
	# nvim -u NONE -c 'ALEFix' -c 'wq' <file_name>

run/lib/%: src/%
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

run/%: %
	@mkdir -p "$(dir $@)"
	ln -sfr "$<" "$@"

dist/%: src/js/% run/.has-npm-uglifyjs
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,uglifyjs) --compress --module --no-annotations --mangle -o "$@" $<

dist/%: src/css/% run/.has-npm-uglifycss
	@mkdir -p "$(dir $@)"
	echo "--- Compressing $< into $@"
	$(call use-bin,uglifycss) --ugly-comments --output "$@" $<

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
	fi


print-%:
	@echo $($*)

FORCE:

.ONESHELL:
# EOF
