// NOTE: We should be able to take the nodes directly from the DOM and not
// use a VNode.
import { VNode } from "./vdom.js";
import { Argument, Injection, Extraction } from "./templates.js";
import { FormattingEffect, TemplateEffect } from "./effects.js";
import { onError } from "./utils/logging.js";
import { getSignature } from "./utils/inspect.js";

// --
// Parses a DOM tree annotated with special attributes and generates components
// and templates from it.

class MarkupProcessor {
	// --
	// Main processor for a `<template>` node.
	onTemplate(node) {
		const name = node.getAttribute("name");
		const declaration = this.onDeclaration(node, ["name"]);
		const children = [];
		for (const child of node.content.childNodes) {
			children.push(this.onTemplateContentNode(child, declaration.scope));
		}
		// TODO: Should strip start and end empty nodes
		return {
			type: "template",
			name,
			template:
				children.length === 1
					? children[0]
					: new VNode(undefined, "#fragment", undefined, children),
			...declaration,
		};
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
		const scope = {};
		for (const a of node.attributes) {
			const name = a.name;
			// TODO: Add default value/transform
			if (name.startsWith("in:")) {
				const _ = new Argument(name.substring(3));
				scope[_.name] = _;
			} else if (name.startsWith("out:")) {
				const _ = new Argument(name.substring(4));
				scope[_.name] = _;
			} else if (name.startsWith("inout:")) {
				const _ = new Argument(name.substring(6));
				scope[_.name] = _;
			} else if (excluded.indexOf(name) === -1) {
				attributes.set(name, a.value);
			}
		}
		return { attributes, scope: Object.create(scope), args: [scope] };
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
				case "out:text":
				case "out:html":
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
					if (name.startWith("ref:")) {
						// RefEffect
					} else if (name.startswith("out:")) {
						// AttributeEffect
					} else if (name.startswith("on:")) {
						// EventHandlerEffect
					} else {
						attributes.set(name, a.value);
					}
			}
		}
		for (const child of node.childNodes) {
			children.push(this.onTemplateContentNode(child, scope));
		}
		return new VNode(
			undefined,
			node.nodeName,
			attributes,
			content ? [content] : children
		);
	}

	getFunction(text, scope, node) {
		const { declaration, args } = getSignature(text);
		for (const a of args) {
			a.id = scope[a.name]?.id;
		}
		try {
			return Object.assign(new Function(`return (${text});`)(), {
				declaration,
				args,
			});
		} catch (error) {
			onError(
				[MarkupProcessor, "getFunction"],
				"Syntax error in markup",
				{ error, node, markup: node.outerHTML }
			);
			return null;
		}
	}
}

const DEFAULT_PROCESSOR = new MarkupProcessor();

export const parameters = (node) => {
	const proc = DEFAULT_PROCESSOR;
	return proc.onComponent(node);
};

// --
// The equivalent of `hyperscript.template()`.
export const template = (name) => {
	const proc = DEFAULT_PROCESSOR;
	const node =
		typeof name === "string"
			? document.querySelector(`template[name="${name}"`)
			: name;
	// NOTE: This mimics `templates.template()`, but I have to say the
	// first part doesn't make sense.
	const template = proc.onTemplate(node);
	const effect = new TemplateEffect(
		new Injection(template.args, false),
		// Why is this undefined, and then why is effect passed to `apply()`?
		undefined,
		template.args,
		template.name
	);
	const apply = (...extraction) =>
		new TemplateEffect(
			new Injection(template.args, false, extraction),
			effect,
			template.args,
			template.name
		);
	return Object.assign(effect, {
		template: template.template,
		args: template.args,
		apply,
		effect,
	});
};

// EOF
