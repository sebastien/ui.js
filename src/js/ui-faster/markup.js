// NOTE: We should be able to take the nodes directly from the DOM and not
// use a VNode.
import { VNode } from "./vdom.js";
import { Argument, Injection, Extraction } from "./templates.js";
import { FormattingEffect, TemplateEffect } from "./effects.js";
import { onError, onSyntaxError } from "./utils/logging.js";
import { getSignature } from "./utils/inspect.js";

// --
// Parses a DOM tree annotated with special attributes and generates components
// and templates from it.
class MarkupProcessor {
	// --
	// Main processor for a `<template>` node.
	onTemplate(node) {
		const name = node.getAttribute("name");
		const { input, scope, attributes } = this.onDeclaration(node, ["name"]);
		const children = [];
		for (const child of node.content.childNodes) {
			children.push(this.onTemplateContentNode(child, scope));
		}
		return {
			template:
				children.length === 1
					? children[0]
					: new VNode(undefined, "#fragment", undefined, children),
			attributes,
			input,
			name,
		};

		// // TODO: Should strip start and end empty nodes
		// return {
		// 	type: "template",
		// 	name,
		// 	template:
		// 		children.length === 1
		// 			? children[0]
		// 			: new VNode(undefined, "#fragment", undefined, children),
		// 	...declaration,
		// };
	}

	// --
	// Main processor for a `<… template="TEMPLATE">` node.
	onComponent(node) {
		const template = node.getAttribute("template");
		const declaration = this.onDeclaration(node, ["template"]);
		const children = [];
		for (const child of node.childNodes) {
			children.push(this.onRawContentNode(child));
		}
		return { type: "component", template, children, ...declaration };
	}

	// TODO: We should do a materialized VDom instead

	// --
	// Parses the declaration of a template or template-applying node,
	// returning a scope and arguments.
	onDeclaration(node, excluded = []) {
		const attributes = new Map();
		const args = {};
		for (const a of node.attributes) {
			const name = a.name;
			// TODO: Add default value/transform
			if (name.startsWith("in:")) {
				const _ = new Argument(name.substring(3));
				args[_.name] = _;
			} else if (name.startsWith("out:")) {
				const _ = new Argument(name.substring(4));
				args[_.name] = _;
			} else if (name.startsWith("inout:")) {
				const _ = new Argument(name.substring(6));
				args[_.name] = _;
			} else if (excluded.indexOf(name) === -1) {
				attributes.set(name, a.value);
			}
		}
		// NOTE: Scope is used to keep track of the mapping between arguments
		// and variable names.
		return { input: args, scope: Object.create(args), attributes };
	}

	// --
	// Processes the given node as a raw node content.
	onRawContentNode(node) {
		const children = [];
		for (const child of node.childNodes) {
			switch (child.nodeType) {
				case Node.COMMENT_NODE:
					break;
				case Node.TEXT_NODE:
					children.push(child.text);
					break;
				case Node.ELEMENT_NODE:
					children.push(this.onRawNode(child));
					break;
				default:
					break;
			}
		}
		const attributes = new Map();
		for (const a of node.attributes) {
			attributes.set(a.name, a.data);
		}
		return new VNode(undefined, node.nodeName, attributes, children);
	}

	// --
	// Processes the given node as a template node, interpreting the different
	// effects.
	onTemplateContentNode(node, scope = {}) {
		switch (node.nodeType) {
			case Node.ELEMENT_NODE:
				break;
			case Node.COMMENT_NODE:
				return null;
			case Node.TEXT_NODE:
				return node.data;
			default:
				return null;
		}
		const attributes = new Map();
		const children = [];
		let content = undefined;
		// NOTE: Any evaluator will be marked as having dynamic inputs, as
		// opposed to HyperScript that uses explicit inputs through selections.
		for (const a of node.attributes) {
			const name = a.name;
			switch (name) {
				case "x-for":
					break;
				case "x-if":
					break;
				case "x:elif":
					break;
				case "x:else":
					break;
				case "x:match":
					break;
				case "x:case":
					break;
				// case "x:effect":
				// 	break;
				// case "on:init":
				// 	break;
				// case "on:mount":
				// 	break;
				// case "on:unmount":
				// 	break;
				case "x:text":
				case "x:html":
					{
						const processor = this.getFunction(
							a.value,
							scope,
							node
						);
						content = new FormattingEffect(
							// TODO: We should probably use a DyamicSelection instead
							// and a null formatter… Or we say that all markup effectors
							// are either functions or values, and function arguments/selection
							// will be extracted.
							new Extraction(processor.args),
							processor,
							children
						);
					}
					break;
				default:
					if (name.startsWith("ref:")) {
						// RefEffect
					} else if (name.startsWith("out:")) {
						// AttributeEffect
					} else if (name.startsWith("on:")) {
						// EventHandlerEffect
					} else {
						const i = name.indexOf(":");
						attributes.set(
							i === -1
								? [undefined, name]
								: [name.substring(0, i), name.substring(i + 1)],
							a.value
						);
					}
			}
		}
		for (const child of node.nodeName === "TEMPLATE"
			? node.content.childNodes
			: node.childNodes) {
			children.push(this.onTemplateContentNode(child, scope));
		}
		return new VNode(
			undefined,
			node.nodeName,
			attributes,
			content ? [content] : children
		);
	}

	// FIXME: Scope is actually a mapping of arguments (slots)
	getFunction(text, scope, node) {
		const { declaration, args } = getSignature(text);
		let inputs = [];
		for (const a of args) {
			a.id = scope[a.name]?.id;
			inputs.push(`${a.id}:${a.name}`);
		}
		const evaluator = new Function(
			`{${inputs.join(",")}}`,
			`return (${text});`
		);
		// TODO: We way want to separate a function that just has the body from
		// one that has arguments.
		try {
			return Object.assign(evaluator, {
				declaration,
				args,
			});
		} catch (error) {
			onSyntaxError(error, text, scope, node.outerHTML);
			return null;
		}
	}
}

const DEFAULT_PROCESSOR = new MarkupProcessor();

export const parameters = (node) => {
	const res = {};
	for (const a of node.attributes) {
		const name = a.name;
		let argname = undefined;
		if (name.startsWith("in:")) {
			argname = name.substring(3);
		} else if (name.startsWith("out:")) {
			argname = name.substring(4);
		} else if (name.startsWith("inout:")) {
			argname = name.substring(6);
		}
		if (argname) {
			// TODO: Should parse the value
			res[argname] = a.value;
		}
	}
	return res;
};

// --
// The equivalent of `hyperscript.template()`.
export const template = (name) => {
	// We get the node for the template
	const proc = DEFAULT_PROCESSOR;
	const node =
		typeof name === "string"
			? document.querySelector(`template[name="${name}"`)
			: name;
	// We extract the template (VNode) and the parameters (structure of Argument).
	const { template, input } = proc.onTemplate(node);
	// We need to return a function that can be used to create an application
	// of the current context
	return Object.assign(
		(...args) =>
			new TemplateEffect(
				// Injects the arguments in `pattern` from the context input, without
				// inheriting the parent context.
				new Injection(
					input,
					false,
					args.length > 0
						? Object.assign({}, args[0], {
								children: args.slice(1),
						  })
						: null
				),
				template
			),
		{
			component: node.getAttribute("name"),
			template,
			input,
		}
	);
};

// EOF
