import { Context, Slot } from "./cells.js";
import {
	AttributeEffect,
	ComponentEffect,
	DynamicComponentEffect,
	Effect,
	EventHandlerEffect,
	FormattingEffect,
	RefEffect,
} from "./effects.js";
import {
	Cell,
	component,
	DerivedCell,
	DynamicEvaluation,
	Injection,
	Selection,
	Signal,
	Subscription,
} from "./templates.js";
import { camelToKebab } from "./utils/text.js";
import { isObject, isPromiseLike } from "./utils/types.js";
import { VNode } from "./vdom.js";

const RE_ATTRIBUTE = /^on(?<event>[A-Z][a-z]+)+$/;
export const Fragment = "#fragment";
const TEMPLATE_KEY = Symbol.for("ui.templateKey");
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
			} else if (m?.groups.event) {
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
							: // Raw promises are normalized to an effect so they
								// can resolve asynchronously with latest-only semantics.
								isPromiseLike(v)
								? new AttributeEffect(new Signal(v))
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
					: // Raw promise children are also normalized to an effect,
						// preserving old text while pending and using latest-only apply.
						isPromiseLike(_)
						? new FormattingEffect(new Signal(_))
						: _,
	);

// The JSX/React-like interface to create VDOM nodes from JavaScript. This is
// used by the `h` hyperscript function below.
const createElement = (element, attributes, ...children) => {
	const templateKey = attributes?.key;
	const resolvedAttributes =
		attributes && Object.hasOwn(attributes, "key")
			? (() => {
					const { key: _key, ...rest } = attributes;
					return rest;
				})()
			: attributes;
	const normalizedChildren = normalizeChildren(children);
	const componentChildren =
		normalizedChildren.length === 0
			? null
			: normalizedChildren.length === 1
				? normalizedChildren[0]
				: new VNode(undefined, Fragment, new Map(), normalizedChildren);
	const withTemplateKey = (value) => {
		if (templateKey !== undefined && value && typeof value === "object") {
			value[TEMPLATE_KEY] = templateKey;
		}
		return value;
	};

	if (element instanceof Slot) {
		return withTemplateKey(
			new DynamicComponentEffect(
				new Injection(undefined, false, {
					...resolvedAttributes,
					children: componentChildren,
				}),
				element,
				component, // We pass in the component factory function
			),
		);
	} else if (typeof element === "function") {
		const c = component(element);
		return withTemplateKey(
			new ComponentEffect(
				new Injection(c.input, false, {
					...resolvedAttributes,
					children: componentChildren,
				}),
				c,
			),
		);
	} else {
		const tagName = element === "" ? Fragment : element;
		return withTemplateKey(
			new VNode(
				...(Array.isArray(tagName) ? tagName : [undefined, tagName]),
				createAttributes(resolvedAttributes),
				normalizedChildren,
			),
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
	if (Array.isArray(value)) {
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
const EFFECT_CLEANUPS = Symbol.for("ui.effect.cleanups");

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

select.cell = (value, updater, extractor, inputExtractor) => {
	if (typeof updater === "function") {
		if (isDerivedShape(value)) {
			return new DerivedCell(value, updater, extractor);
		}
		if (value instanceof Slot) {
			if (extractor === undefined || typeof extractor === "boolean") {
				const lazy = extractor === true;
				const derive = inputExtractor
					? ({ source }) => updater(inputExtractor(source))
					: ({ source }) => updater(source);
				return new DerivedCell({ source: value }, derive, lazy);
			}
			return new Cell(value, updater, extractor);
		}
	}
	return new Cell(value, updater, extractor);
};

select.effect = (selection, handler, options = undefined) => {
	if (!selection || typeof handler !== "function") {
		return;
	}
	const normalized =
		typeof options === "boolean" ? { immediate: options } : options || {};
	const context = normalized.context || Context.Get();
	if (!context) {
		return;
	}
	const immediate = normalized.immediate === true;
	const mode = normalized.mode || "switch";
	Slot.Each(selection, (slot) => {
		if (slot && typeof slot.applyContext === "function") {
			slot.applyContext(context);
		}
	});
	if (typeof selection.applyContext === "function") {
		selection.applyContext(context);
	}
	const ids = [];
	const seenIds = new Set();
	Slot.Each(selection, (slot) => {
		if (!slot || slot.id === undefined || seenIds.has(slot.id)) {
			return;
		}
		seenIds.add(slot.id);
		ids.push(slot.id);
	});
	if (!ids.length) {
		return;
	}
	let previous;
	let hasPrevious = false;
	let cleanup;
	let runId = 0;
	let controller;
	let stopped = false;
	const disposeCurrent = () => {
		if (typeof cleanup === "function") {
			const previousCleanup = cleanup;
			cleanup = undefined;
			previousCleanup();
		}
		if (controller) {
			controller.abort();
			controller = undefined;
		}
	};
	const stop = () => {
		if (stopped) {
			return;
		}
		stopped = true;
		for (let i = 0; i < ids.length; i++) {
			Slot.Unsub(context, ids[i], listener);
		}
		disposeCurrent();
	};
	const listener = () => {
		if (stopped) {
			return;
		}
		const next = Slot.Expand(selection, context);
		const prev = hasPrevious ? previous : undefined;
		hasPrevious = true;
		previous = next;
		disposeCurrent();
		const currentRunId = ++runId;
		controller =
			mode === "switch" && typeof AbortController === "function"
				? new AbortController()
				: undefined;
		const signal = controller?.signal;
		const runCleanups = [];
		cleanup = () => {
			for (let i = runCleanups.length - 1; i >= 0; i--) {
				runCleanups[i]();
			}
		};
		const onCleanup = (functor) => {
			if (
				typeof functor === "function" &&
				!stopped &&
				currentRunId === runId &&
				!signal?.aborted
			) {
				runCleanups.push(functor);
			}
		};
		const api = {
			signal,
			run: (functor, ...args) =>
				typeof functor === "function"
					? invokeInContext(functor, context, undefined, args)
					: undefined,
			bind: (functor) => select.bind(functor, context),
			onCleanup,
			stop,
		};
		const result = invokeInContext(handler, context, undefined, [
			next,
			prev,
			api,
		]);
		if (result && typeof result.then === "function") {
			result.then((resolved) => {
				if (stopped || currentRunId !== runId || signal?.aborted) {
					return;
				}
				onCleanup(resolved);
			});
		} else {
			onCleanup(result);
		}
	};
	for (let i = 0; i < ids.length; i++) {
		Slot.Sub(context, ids[i], listener);
	}
	const cleanups = context[EFFECT_CLEANUPS] || (context[EFFECT_CLEANUPS] = []);
	cleanups.push({
		dispose: stop,
	});
	if (immediate) {
		listener();
	}
	return stop;
};

select.watch = select.effect;

select.signal = (value, context = []) => {
	return new Signal(value, context);
};

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
	let inferred;
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

const win = typeof window !== "undefined" ? window : undefined;
select.raf = (callback) => {
	if (win) {
		const raf =
			win.requestAnimationFrame ||
			win.webkitRequestAnimationFrame ||
			win.mozRequestAnimationFrame ||
			win.msRequestAnimationFrame ||
			((callback) => setTimeout(() => callback(0), 16));
		return raf.call(win, callback);
	} else {
		return setTimeout(() => callback(0), 16);
	}
};

select.swallow = (event) => {
	if (event && typeof event.stopPropagation === "function") {
		event.stopPropagation();
	}
	return false;
};

export const $ = select;
export default $;

// EOF
