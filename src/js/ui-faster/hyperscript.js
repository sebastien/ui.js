import { Argument, Injection, factory } from "./templates.js";
import { Slot } from "./cells.js";
import { VNode } from "./vdom.js";
import {
	Effect,
	AttributeEffect,
	FormattingEffect,
	EventHandlerEffect,
} from "./effects.js";
import { assign } from "./utils/collections.js";
import { getSignature } from "./utils/inspect.js";
import { isObject } from "./utils/types.js";
import { camelToKebab } from "./utils/text.js";

const RE_ATTRIBUTE = new RegExp("^on(?<event>[A-Z][a-z]+)+$", "g");

// TODO: This should be moved to HyperScript, probably.
//
// --
// Takes the given `component` function, and returns its derivation
// template, creating it if necessary. The creation of the template inspects
// the function to extract its arguments signature,
export const template = (component) => {
	if (component.factory) {
		return component.factory;
	} else {
		// We extract the signature from the component function
		// definition. Each argument is then assigned in `args`, which
		// will hold the shape of the input.
		const args = [];
		for (const { path, name } of getSignature(component).args) {
			assign(args, path, new Argument(name));
		}

		return (component.factory = factory(
			component(...args),
			args[0],
			component.name
		));
	}
};

// --
// The JSX/React-like interface to create VDOM nodes from JavaScript. This is
// used by the `h` hyperscript function below.
const createElement = (element, attributes, ...children) => {
	if (typeof element === "function") {
		return element.factory
			? element.factory(attributes, ...children)
			: element(attributes, ...children);
	} else {
		const attr = new Map();
		for (const k in attributes) {
			let [ns, name] = k.split(":");
			if (!name) {
				name = ns;
				ns = undefined;
			}
			if (name === "_") {
				name = "class";
			}
			const v = attributes[k];
			const m = RE_ATTRIBUTE.exec(k);
			if (m && m.groups.event) {
				name = name.toLowerCase();
				attr.set(
					[ns, name],
					typeof v === "function" ? EventHandlerEffect.Ensure(v) : v
				);
			} else {
				attr.set(
					[ns, camelToKebab(name)],
					v instanceof Effect
						? v
						: v instanceof Slot
						? new AttributeEffect(v)
						: v
				);
			}
		}
		return new VNode(
			element,
			attr,
			children.map((_) =>
				_ instanceof Effect
					? _
					: _ instanceof Slot
					? new FormattingEffect(_)
					: _
			)
		);
	}
};

// --
// Defines a proxy behaviour that dynamically creates `VNode` factories
// within a given namespace.
export class VDOMFactoryProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		if (scope.tags === undefined) {
			scope.tags = new Map();
		}
		const tags = scope.tags;
		// TODO: Support `h.Fragment`
		if (tags.has(property)) {
			return tags.get(property);
		} else {
			const res = (attributes, ...args) =>
				attributes !== null &&
				attributes !== undefined &&
				isObject(attributes)
					? new VNode(this.namespace, property, attributes, args)
					: new VNode(this.namespace, property, null, [
							attributes,
							...args,
					  ]);
			tags.set(property, res);
			return res;
		}
	}
}

export const h = new Proxy(createElement, new VDOMFactoryProxy());

// Creates a new `Selection` out of the given arguments.
export const select = Object.assign(
	(args) =>
		args instanceof Selection ? args : new Selection(new Injection(args)),
	{}
);
export const $ = select;

// EOF
