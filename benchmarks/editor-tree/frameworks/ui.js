import { render } from "../../../src/js/ui/client.js";
import { $, h } from "../../../src/js/ui/hyperscript.js";
import { isDocumentNode } from "../common.js";

const renderDocumentNode = (node) => {
	if (!isDocumentNode(node)) {
		return "";
	}
	if (node.type === "text") {
		return node.value;
	}
	return h(
		node.tag,
		node.attrs || null,
		...(node.children || []).map((child) => renderDocumentNode(child)),
	);
};

const DocumentTree = ({ value }) =>
	value.apply((node) => renderDocumentNode(node));

export const createApp = async (root, initialValue) => {
	const context = {};
	const value = $.cell(initialValue);

	value.observable(context);
	value.set(initialValue, true, context);
	const { dispose } = render(DocumentTree, { value }, root, undefined, context);

	return {
		update(nextValue) {
			value.set(nextValue, true, context);
		},
		dispose() {
			dispose();
		},
	};
};
