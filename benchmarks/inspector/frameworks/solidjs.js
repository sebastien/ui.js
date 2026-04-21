import { createSignal } from "https://esm.sh/solid-js";
import { createStore, reconcile } from "https://esm.sh/solid-js/store";
import { render } from "https://esm.sh/solid-js/web";
import h from "https://esm.sh/solid-js/h";

const renderNode = (value) => {
	const t = getType(value);
	if (t === "object" || t === "map") {
		const ul = document.createElement("ul");
		ul.className = "comma curlies dim-ab";
		for (const [key, entryValue] of Object.entries(value)) {
			const li = document.createElement("li");
			li.className = "pl-2";
			const span = document.createElement("span");
			span.className = "mono dim small";
			span.textContent = `${key}:`;
			li.appendChild(span);
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
			const span = document.createElement("span");
			span.className = "mono dim small";
			span.textContent = `#${i}:`;
			li.appendChild(span);
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

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const Inspector = (props) => {
	const value = typeof props.value === "function" ? props.value() : props.value;

	switch (getType(value)) {
		case "object":
		case "map":
			return h(
				"ul",
				{ className: "comma curlies dim-ab" },
				...Object.entries(value).map(([key, entryValue]) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `${key}:`),
						" ",
						h(Inspector, { value: () => entryValue })
					)
				)
			);
		case "array":
			return h(
				"ul",
				{ className: "comma brackets dim-ab" },
				...value.map((entryValue, index) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `#${index}:`),
						" ",
						h(Inspector, { value: () => entryValue })
					)
				)
			);
		default:
			return h("span", null, `${value}`);
	}
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

	const [value, setValue] = createStore(initialValue);
	const dispose = render(() => h(Inspector, { value }), root);
	return {
		update(nextValue) {
			setValue(reconcile(nextValue));
		},
		dispose,
	};
};
