import { render } from "../../../src/js/ui/client.js";
import { h, $ } from "../../../src/js/ui/hyperscript.js";

const { li, span, ul } = h;

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const renderNode = (value) => {
	const t = getType(value);
	if (t === "object" || t === "map") {
		const ul = document.createElement("ul");
		ul.className = "comma curlies dim-ab";
		for (const [key, entryValue] of Object.entries(value)) {
			const li = document.createElement("li");
			li.className = "pl-2";
			const keySpan = document.createElement("span");
			keySpan.className = "mono dim small";
			keySpan.textContent = `${key}:`;
			li.appendChild(keySpan);
			li.appendChild(document.createTextNode(" "));
			li.appendChild(renderNode(entryValue));
			ul.appendChild(li);
		}
		return ul;
	}
	if (t === "array") {
		const ul = document.createElement("ul");
		ul.className = "comma brackets dim-ab";
		for (let i = 0; i < value.length; i++) {
			const li = document.createElement("li");
			li.className = "pl-2";
			const keySpan = document.createElement("span");
			keySpan.className = "mono dim small";
			keySpan.textContent = `#${i}:`;
			li.appendChild(keySpan);
			li.appendChild(document.createTextNode(" "));
			li.appendChild(renderNode(value[i]));
			ul.appendChild(li);
		}
		return ul;
	}
	const span = document.createElement("span");
	span.textContent = `${value}`;
	return span;
};

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

export const createApp = async (root, initialValue, options = {}) => {
	if (options.captureSnapshots === true) {
		root.replaceChildren(renderNode(initialValue));
		return {
			update(nextValue) {
				root.replaceChildren(renderNode(nextValue));
			},
			dispose() {
				root.replaceChildren();
			},
		};
	}

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
