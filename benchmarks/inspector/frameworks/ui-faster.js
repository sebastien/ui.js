import { render } from "../../../src/js/ui-faster/client.js";
import { h, $ } from "../../../src/js/ui-faster/hyperscript.js";

const { li, span, ul } = h;

const Inspector = ({ value }) => {
	const type = value.apply((_) =>
		_ === undefined || _ === null
			? "undefined"
			: _ instanceof Map
				? "map"
				: _ instanceof Array
					? "array"
					: typeof _
	);

	return type.match(
		(_) =>
			_.case(
				"object",
				"map",
				ul(
					{ _: "comma curlies dim-ab" },
					value.map((entryValue, key) =>
						li(
							{ _: "pl-2" },
							span({ _: "mono dim small" }, key.text((_) => `${_}:`)),
							" ",
							h(Inspector, { value: entryValue })
						)
					)
				)
			),
		(_) =>
			_.case(
				"array",
				ul(
					{ _: "comma brackets dim-ab" },
					value.map((entryValue, key) =>
						li(
							{ _: "pl-2" },
							span({ _: "mono dim small" }, key.text((_) => `#${_}:`)),
							" ",
							h(Inspector, { value: entryValue })
						)
					)
				)
			),
		(_) => _.else(span(value.text()))
	);
};

export const createApp = async (root, initialValue) => {
	const context = {};
	const value = $.cell(initialValue);

	value.observable(context);
	value.set(initialValue, true, context);
	render(Inspector, { value }, root, undefined, context);

	return {
		update(nextValue) {
			value.set(nextValue, true, context);
		},
		dispose() {
			root.replaceChildren();
		},
	};
};
