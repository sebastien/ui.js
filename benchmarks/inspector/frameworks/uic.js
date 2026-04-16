import { render } from "../../../src/js/ui/client.js";
import { h, $ } from "../../../src/js/ui/hyperscript.js";
import { compiled } from "../../../src/js/uic/runtime.js";

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
					'<ul data-uic-node="uic:n0" class="comma curlies dim-ab"><!--uic:t0--></ul>',
					[
						{
							kind: "text",
							marker: "uic:t0",
							get: () =>
								value.map((entryValue, key) =>
									compiled(
										'<li class="pl-2"><span class="mono dim small"><!--uic:t0--></span> <!--uic:t1--></li>',
										[
											{
												kind: "text",
												marker: "uic:t0",
												get: () => key.text((_) => `${_}:`),
											},
											{
												kind: "text",
												marker: "uic:t1",
												get: () => h(Inspector, { value: entryValue }),
											},
										],
									),
								),
						},
					],
				),
			),
		(_) =>
			_.case(
				"array",
				compiled(
					'<ul data-uic-node="uic:n1" class="comma brackets dim-ab"><!--uic:t0--></ul>',
					[
						{
							kind: "text",
							marker: "uic:t0",
							get: () =>
								value.map((entryValue, key) =>
									compiled(
										'<li class="pl-2"><span class="mono dim small"><!--uic:t0--></span> <!--uic:t1--></li>',
										[
											{
												kind: "text",
												marker: "uic:t0",
												get: () => key.text((_) => `#${_}:`),
											},
											{
												kind: "text",
												marker: "uic:t1",
												get: () => h(Inspector, { value: entryValue }),
											},
										],
									),
								),
						},
					],
				),
			),
		(_) =>
			_.else(
				compiled("<span><!--uic:t0--></span>", [
					{ kind: "text", marker: "uic:t0", get: () => value.text() },
				]),
			),
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
