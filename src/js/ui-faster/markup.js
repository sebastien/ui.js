// NOTE: We should be able to take the nodes directly from the DOM and not
// use a VNode.
import { VNode } from "./vdom.js";
import { Argument, Extraction, application } from "./templates.js";
import { FormattingEffect } from "./effects.js";
import { onSyntaxError } from "./utils/logging.js";
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
		let children = [];
		for (const child of node.content.childNodes) {
			const v = this.onTemplateNode(child, scope, children);
			if (v === null) {
				// pass
			} else if (v instanceof Array) {
				children = children.concat(v);
			} else {
				children.push(v);
			}
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
	}

	// --
	// Main processor for a `<… template="TEMPLATE">` node.
	onComponent(node) {
		const template = node.getAttribute("template");
		const declaration = this.onDeclaration(node, ["template"]);
		const children = [];
		// FIXME: Actually, components may have nodes that have components
		// already as well, so we'll need to handle that.
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
	// Processes the given node as a raw node content, ie a node that contains
	// no effects at all.
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
			// TODO: Should support namespace
			attributes.set(a.name, a.data);
		}
		return new VNode(undefined, node.nodeName, attributes, children);
	}

	// --
	// Processes the attributes of the given node, registering the corresponding
	// effects in the attributes map.
	onTemplateAttributes(node, scope = {}, attributes = new Map()) {
		// NOTE: Any evaluator will be marked as having dynamic inputs, as
		// opposed to HyperScript that uses explicit inputs through selections.
		for (const a of node.attributes) {
			const name = a.name;
			switch (name) {
				// Theseare all reserved attributes processed by templates
				case "x:for":
				case "x:if":
				case "x:elif":
				case "x:else":
				case "x:match":
				case "x:case":
				case "x:effect":
				case "on:init":
				case "on:mount":
				case "on:unmount":
				case "x:text":
				case "x:html":
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
		return attributes;
	}

	onTemplateEffects(node, scope, content, effects = []) {
		// if (node.hasAttribute("x:for")) { }
		// if (node.hasAttribute("x:if")) { }
		// if (node.hasAttribute("x:elif")) { }
		// if (node.hasAttribute("x:else")) { }
		// if (node.hasAttribute("x:match")) { }
		// if (node.hasAttribute("x:case")) { }
		// if (node.hasAttribute("x:html")) { }
		if (node.hasAttribute("x:text")) {
			const processor = this.getFunction(
				node.getAttribute("x:text"),
				scope,
				node
			);
			effects.push(
				new FormattingEffect(
					// TODO: We should probably use a DyamicSelection instead
					// and a null formatter… Or we say that all markup effectors
					// are either functions or values, and function arguments/selection
					// will be extracted.
					new Extraction(processor.args),
					processor,
					content
				)
			);
		}
		return effects;
	}

	isTemplateNode(node) {
		return node.nodeName === "TEMPLATE" || node.nodeName === "template";
	}

	// --
	// Processes the given node as a template node, processing special
	// attributes and content to produce effects. Note that `<template>`
	// nodes content will be inlined.
	onTemplateNode(node, scope = {}) {
		switch (node.nodeType) {
			case Node.ELEMENT_NODE:
				// If it's an element node, we keep it.
				break;
			case Node.TEXT_NODE:
				return /^[ \t\n]*$/.test(node.data) ? null : node.data;
			case Node.COMMENT_NODE:
				return null;
			default:
				return null;
		}
		// We get the children
		let children = [];
		const is_template = this.isTemplateNode(node);
		for (const child of is_template
			? node.content.childNodes
			: node.childNodes) {
			const v = this.onTemplateNode(child, scope);
			if (v === null) {
				// pass
			} else if (v instanceof Array) {
				children = children.concat(v);
			} else if (v.name === "#fragment") {
				children = children.concat(v.children);
			} else {
				children.push(v);
			}
		}
		// And if we have any effect, we'll pass the children to the effects
		// and the effects will replace the children.
		const effects = this.onTemplateEffects(node, children, scope);
		if (is_template) {
			// If it's a template node, then we're just returning the effects
			// as we don't want the node.
			return effects.length ? effects : children;
		} else {
			return new VNode(
				undefined,
				node.nodeName,
				this.onTemplateAttributes(node, scope),
				effects.length ? effects : children
			);
		}
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
			onSyntaxError(error, text, { scope, node });
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
	console.log("XXXX APPLICATION", template);
	return application(
		template,
		input,
		typeof name === "string" ? name : node.getAttribute("name")
	);
};

// EOF
