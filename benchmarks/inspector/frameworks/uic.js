import { render } from "../../../src/js/ui/client.js";
import { h, $ } from "../../../src/js/ui/hyperscript.js";
import { compiled } from "../../../src/js/uic/runtime.js";

const LIST_OBJECT_TEMPLATE =
	'<ul data-uic-node="uic:n0" class="comma curlies dim-ab"><!--uic:t0--></ul>';
const LIST_OBJECT_BINDINGS = [{ kind: "text", marker: "uic:t0" }];

const LIST_ARRAY_TEMPLATE =
	'<ul data-uic-node="uic:n1" class="comma brackets dim-ab"><!--uic:t0--></ul>';
const LIST_ARRAY_BINDINGS = [{ kind: "text", marker: "uic:t0" }];

const LIST_ITEM_TEMPLATE =
	'<li class="pl-2"><span class="mono dim small"><!--uic:t0--></span> <!--uic:t1--></li>';
const LIST_ITEM_BINDINGS = [
	{ kind: "text", marker: "uic:t0" },
	{ kind: "text", marker: "uic:t1" },
];

const LEAF_TEMPLATE = "<span><!--uic:t0--></span>";
const LEAF_BINDINGS = [{ kind: "text", marker: "uic:t0" }];

const Inspector = ({ value }) => {
	const type = value.apply((_) =>
		_ === undefined || _ === null
			? "undefined"
			: _ instanceof Map
				? "map"
				: _ instanceof Array
					? "array"
					: typeof _,
	);

	return type.match(
		(_) =>
			_.case(
				"object",
				"map",
				compiled(
					LIST_OBJECT_TEMPLATE,
					LIST_OBJECT_BINDINGS,
					value.map((entryValue, key) =>
						compiled(
							LIST_ITEM_TEMPLATE,
							LIST_ITEM_BINDINGS,
							key.text((_) => `${_}:`),
							h(Inspector, { value: entryValue }),
						),
					),
				),
			),
		(_) =>
			_.case(
				"array",
				compiled(
					LIST_ARRAY_TEMPLATE,
					LIST_ARRAY_BINDINGS,
					value.map((entryValue, key) =>
						compiled(
							LIST_ITEM_TEMPLATE,
							LIST_ITEM_BINDINGS,
							key.text((_) => `#${_}:`),
							h(Inspector, { value: entryValue }),
						),
					),
				),
			),
		(_) => _.else(compiled(LEAF_TEMPLATE, LEAF_BINDINGS, value.text())),
	);
};

export const createApp = async (root, initialValue) => {
	const context = {};
	const value = $.cell(initialValue);

	value.observable(context);
	value.set(initialValue, true, context);
	const { dispose } = render(Inspector, { value }, root, undefined, context);

	return {
		update(nextValue) {
			value.set(nextValue, true, context);
		},
		dispose() {
			dispose();
		},
	};
};
