import {
	Injection,
	Selection,
	DynamicEvaluation,
	Subscription,
	Cell,
	DerivedCell,
	component,
} from "./templates.js";
import { Context, Slot } from "./cells.js";
import { VNode } from "./vdom.js";
import {
	Effect,
	AttributeEffect,
	FormattingEffect,
	ComponentEffect,
	DynamicComponentEffect,
	RefEffect,
	EventHandlerEffect,
} from "./effects.js";
import { isObject } from "./utils/types.js";
import { camelToKebab } from "./utils/text.js";

const RE_ATTRIBUTE = new RegExp("^on(?<event>[A-Z][a-z]+)+$");
export const Fragment = "#fragment";

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
			if (name === "ref") {
				attr.set([ns, camelToKebab(name)], new RefEffect(v));
			} else if (m && m.groups.event) {
				name = name.toLowerCase();
				attr.set(
					[ns, name],
					typeof v === "function" || v instanceof Slot
						? EventHandlerEffect.Ensure(v, name)
						: v,
				);
			} else {
				attr.set(
					[ns, camelToKebab(name)],
					v instanceof Effect
						? v
						: v instanceof Slot
							? new AttributeEffect(v)
							: v,
				);
			}
		}
	}
	return attr;
};

const flattenChildren = (arr) =>
	arr.reduce(
		(acc, val) =>
			Array.isArray(val) ? acc.concat(flattenChildren(val)) : acc.concat(val),
		[],
	);

const normalizeChildren = (children) =>
	flattenChildren(children).map((_) =>
		_ instanceof Effect ||
		(typeof _?.render === "function" && _ instanceof Slot)
			? _
			: _ instanceof Selection && _.name === "children"
				? _.apply((value) => value)
				: _ instanceof Slot
					? new FormattingEffect(_)
					: _,
	);

// The JSX/React-like interface to create VDOM nodes from JavaScript. This is
// used by the `h` hyperscript function below.
const createElement = (element, attributes, ...children) => {
	const normalizedChildren = normalizeChildren(children);
	const componentChildren =
		normalizedChildren.length === 0
			? null
			: normalizedChildren.length === 1
				? normalizedChildren[0]
				: new VNode(undefined, Fragment, new Map(), normalizedChildren);

	if (element instanceof Slot) {
		return new DynamicComponentEffect(
			new Injection(undefined, false, {
				...attributes,
				children: componentChildren,
			}),
			element,
			component, // We pass in the component factory function
		);
	} else if (typeof element === "function") {
		const c = component(element);
		return new ComponentEffect(
			new Injection(c.input, false, {
				...attributes,
				children: componentChildren,
			}),
			c,
		);
	} else {
		return new VNode(
			...(element instanceof Array ? element : [undefined, element]),
			createAttributes(attributes),
			normalizedChildren,
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
		if (property === "Fragment") {
			return Fragment;
		}
		if (tags.has(property)) {
			return tags.get(property);
		} else {
			const res = (attributes, ...args) =>
				attributes !== null && attributes !== undefined && isObject(attributes)
					? createElement([this.namespace, property], attributes, ...args)
					: createElement(
							[this.namespace, property],
							null,
							attributes,
							...args,
						);
			tags.set(property, res);
			return res;
		}
	}
}

export const h = new Proxy(createElement, new VDOMFactoryProxy());

// Creates a new `Selection` out of the given arguments.
export const select = Object.assign((...args) =>
	args.length > 1
		? new Subscription(args, true)
		: args.length === 1
			? args[0] instanceof Function
				? new DynamicEvaluation(args[0])
				: args instanceof Selection
					? new Subscription(args[0])
					: // FIXME: Not sure why we have an injection here
						new Subscription(new Injection(args[0]))
			: {},
);

const isDerivedShape = (value) => {
	if (value instanceof Array) {
		return value.every((_) => _ instanceof Slot);
	}
	if (value && Object.getPrototypeOf(value) === Object.prototype) {
		for (const k in value) {
			if (!(value[k] instanceof Slot)) {
				return false;
			}
		}
		return true;
	}
	return false;
};

const BOUND_CONTEXT = Symbol.for("ui.boundContext");
const CURRENT_EVENT_TARGET = Symbol.for("ui.currentEventTarget");

const invokeInContext = (functor, context, thisArg, args) =>
	context
		? Context.Run(context, () => functor.apply(thisArg, args))
		: functor.apply(thisArg, args);

const normalizeEventName = (eventName) => {
	if (typeof eventName !== "string") {
		return "";
	}
	const normalized = eventName.toLowerCase();
	return normalized.startsWith("on") ? normalized.substring(2) : normalized;
};

select.cell = (value, updater, extractor) =>
	typeof updater === "function" && isDerivedShape(value)
		? new DerivedCell(value, updater, extractor)
		: new Cell(value, updater, extractor);

select.bind = (functor, context = Context.Get()) => {
	if (typeof functor !== "function") {
		return functor;
	}
	const wrapper = function (...args) {
		return invokeInContext(functor, context, this, args);
	};
	wrapper[BOUND_CONTEXT] = context;
	return wrapper;
};

select.run = (functor, context = Context.Get(), ...args) => {
	if (typeof functor !== "function") {
		return undefined;
	}
	return invokeInContext(functor, context, undefined, args);
};

select.send = (eventName, value, node) => {
	const resolvedEventName = normalizeEventName(eventName);
	const context = Context.Get();
	const explicit = node?.ownerElement ?? node;
	let inferred = undefined;
	if (!explicit && context) {
		let current = context;
		while (current && !inferred) {
			const currentEventTarget = current[CURRENT_EVENT_TARGET];
			if (
				currentEventTarget &&
				typeof currentEventTarget.dispatchEvent === "function"
			) {
				inferred = currentEventTarget;
				break;
			}
			current = current[Slot.Parent];
		}
	}
	if (!explicit && !inferred && context) {
		let current = context;
		while (current && !inferred) {
			const owner = current[Slot.Owner];
			const candidate = owner ? current[owner.id + Slot.Node] : undefined;
			const resolved = candidate?.ownerElement ?? candidate;
			if (resolved && typeof resolved.dispatchEvent === "function") {
				inferred = resolved;
				break;
			}
			current = current[Slot.Parent];
		}
	}
	const target = explicit ?? inferred;
	if (
		!resolvedEventName ||
		!target ||
		typeof target.dispatchEvent !== "function"
	) {
		return false;
	}
	const EventCtor =
		target?.ownerDocument?.defaultView?.Event ?? globalThis.Event;
	const CustomEventCtor =
		target?.ownerDocument?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
	const useBaseEvent =
		typeof EventCtor === "function" &&
		EventCtor.prototype &&
		typeof EventCtor.prototype._setPath === "function";
	const event = useBaseEvent
		? new EventCtor(resolvedEventName, { bubbles: true, composed: true })
		: new CustomEventCtor(resolvedEventName, {
				detail: value,
				bubbles: true,
				composed: true,
			});
	if (useBaseEvent) {
		event.detail = value;
	}
	return target.dispatchEvent(event);
};

select.get = (selection) =>
	new Proxy(
		{},
		{
			get(_scope, property) {
				return selection.apply((value) =>
					value === null || value === undefined ? undefined : value[property],
				);
			},
		},
	);

export const $ = select;

// EOF
