import { Injection, Selection, Cell, component } from "./templates.js";
import { Slot } from "./cells.js";
import { VNode } from "./vdom.js";
import {
	Effect,
	AttributeEffect,
	FormattingEffect,
	ComponentEffect,
	DynamicComponentEffect,
	EventHandlerEffect,
} from "./effects.js";
import { isObject } from "./utils/types.js";
import { camelToKebab } from "./utils/text.js";

const RE_ATTRIBUTE = new RegExp("^on(?<event>[A-Z][a-z]+)+$");

const createAttributes = (attributes) => {
	const attr = new Map();
	if (attributes) {
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
					typeof v === "function"
						? EventHandlerEffect.Ensure(v, name)
						: v
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
	}
	return attr;
};

const normalizeChildren = (children) =>
	children.map((_) =>
		_ instanceof Effect
			? _
			: _ instanceof Slot
			? new FormattingEffect(_)
			: _
	);

// The JSX/React-like interface to create VDOM nodes from JavaScript. This is
// used by the `h` hyperscript function below.
const createElement = (element, attributes, ...children) => {
	if (element instanceof Slot) {
		return new DynamicComponentEffect(
			new Injection(undefined, false, {
				...attributes,
				children: normalizeChildren(children),
			}),
			element,
			component // We pass in the component factory function
		);
	} else if (typeof element === "function") {
		const c = component(element);
		return new ComponentEffect(
			new Injection(c.input, false, {
				...attributes,
				children: normalizeChildren(children),
			}),
			c
		);
	} else {
		return new VNode(
			...(element instanceof Array ? element : [undefined, element]),
			createAttributes(attributes),
			normalizeChildren(children)
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
					? createElement(
							[this.namespace, property],
							attributes,
							...args
					  )
					: createElement(
							[this.namespace, property],
							null,
							attributes,
							...args
					  );
			tags.set(property, res);
			return res;
		}
	}
}

export const h = new Proxy(createElement, new VDOMFactoryProxy());

// Creates a new `Selection` out of the given arguments.
export const select = Object.assign(
	(args) =>
		args instanceof Function
			? new DynamicEvaluation(args)
			: args instanceof Selection
			? args
			: new Selection(new Injection(args)),
	{}
);

select.cell = (value, updater) => new Cell(value, updater);

export const $ = select;

// EOF
