import { Slot } from "../ui/cells.js";
import {
	AttributeEffect,
	Effect,
	EventHandlerEffect,
	FormattingEffect,
	RefEffect,
} from "../ui/effects.js";
import { Selection, Signal } from "../ui/templates.js";
import { camelToKebab } from "../ui/utils/text.js";
import { isPromiseLike } from "../ui/utils/types.js";
import { VNode } from "../ui/vdom.js";

const TEMPLATE_AST_CACHE = new Map();
const PLAN_CACHE = new Map();
const PLAN_CACHE_BY_BINDINGS = new WeakMap();
const BINDING_SIGNATURE_CACHE = new WeakMap();
const STATIC_ATTRS_KEY = Symbol.for("ui.staticAttrs");
const RE_ATTRIBUTE = /^on(?<event>[A-Z][a-z]+)+$/;
const FRAGMENT_TAG = "#fragment";
const EMPTY_ATTRS = new Map();
const STATIC_ATTRS_CACHE = new WeakMap();

const decodeEntities = (value) =>
	value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

const signatureOf = (bindings) => {
	const cached = BINDING_SIGNATURE_CACHE.get(bindings);
	if (cached !== undefined) {
		return cached;
	}

	let signature = "";
	for (let i = 0; i < bindings.length; i++) {
		const binding = bindings[i];
		if (i > 0) {
			signature += ";";
		}
		signature += `${binding.kind || ""}|${binding.node || ""}|${binding.marker || ""}|${binding.name || ""}|${binding.event || ""}`;
	}
	BINDING_SIGNATURE_CACHE.set(bindings, signature);
	return signature;
};

const flattenChildrenInto = (value, out) => {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			flattenChildrenInto(value[i], out);
		}
		return;
	}
	out.push(value);
};

const normalizeChild = (child) =>
	child instanceof Effect ||
	(typeof child?.render === "function" && child instanceof Slot)
		? child
		: child instanceof Selection && child.name === "children"
			? child.apply((value) => value)
			: child instanceof Slot
				? new FormattingEffect(child)
				: isPromiseLike(child)
					? new FormattingEffect(new Signal(child))
					: child;

const normalizeChildren = (children) => {
	let hasArrays = false;
	let needsNormalization = false;

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (Array.isArray(child)) {
			hasArrays = true;
			break;
		}
		if (
			(child instanceof Selection && child.name === "children") ||
			child instanceof Slot ||
			isPromiseLike(child)
		) {
			needsNormalization = true;
		}
	}

	let source = children;
	if (hasArrays) {
		source = [];
		for (let i = 0; i < children.length; i++) {
			flattenChildrenInto(children[i], source);
		}
		needsNormalization = true;
	}

	if (!needsNormalization) {
		return source;
	}

	const normalized = new Array(source.length);
	for (let i = 0; i < source.length; i++) {
		normalized[i] = normalizeChild(source[i]);
	}
	return normalized;
};

const createAttributes = (attributes) => {
	if (!attributes) {
		return EMPTY_ATTRS;
	}
	if (attributes[STATIC_ATTRS_KEY] === true) {
		const cached = STATIC_ATTRS_CACHE.get(attributes);
		if (cached) {
			return cached;
		}
	}

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

		const value = attributes[k];
		const match = RE_ATTRIBUTE.exec(k);
		if (name === "ref") {
			attr.set([ns, camelToKebab(name)], new RefEffect(value));
		} else if (match?.groups.event) {
			name = name.toLowerCase();
			attr.set(
				[ns, name],
				typeof value === "function" || value instanceof Slot
					? EventHandlerEffect.Ensure(value, name)
					: value,
			);
		} else {
			attr.set(
				[ns, camelToKebab(name)],
				value instanceof Effect
					? value
					: value instanceof Slot
						? new AttributeEffect(value)
						: isPromiseLike(value)
							? new AttributeEffect(new Signal(value))
							: value,
			);
		}
	}

	if (attributes[STATIC_ATTRS_KEY] === true) {
		STATIC_ATTRS_CACHE.set(attributes, attr);
	}

	return attr;
};

const parseTagName = (html, cursor) => {
	let i = cursor;
	let name = "";
	while (i < html.length) {
		const ch = html[i];
		if (/[\s/>]/.test(ch)) {
			break;
		}
		name += ch;
		i += 1;
	}
	return { name, cursor: i };
};

const skipWhitespace = (html, cursor) => {
	let i = cursor;
	while (i < html.length && /\s/.test(html[i])) {
		i += 1;
	}
	return i;
};

const parseAttributes = (html, cursor, attrs) => {
	let i = cursor;
	while (i < html.length) {
		i = skipWhitespace(html, i);
		if (html[i] === ">" || (html[i] === "/" && html[i + 1] === ">")) {
			break;
		}

		let name = "";
		while (i < html.length && !/[\s=/>]/.test(html[i])) {
			name += html[i];
			i += 1;
		}
		i = skipWhitespace(html, i);
		let value = true;
		if (html[i] === "=") {
			i += 1;
			i = skipWhitespace(html, i);
			const quote = html[i];
			if (quote === '"' || quote === "'") {
				i += 1;
				let text = "";
				while (i < html.length && html[i] !== quote) {
					text += html[i];
					i += 1;
				}
				value = decodeEntities(text);
				i += 1;
			}
		}
		attrs[name] = value;
	}
	return i;
};

const parseTemplateAst = (html) => {
	const root = { t: "frag", c: [] };
	const stack = [root];
	let i = 0;
	while (i < html.length) {
		if (html[i] === "<") {
			if (html.startsWith("<!--", i)) {
				const close = html.indexOf("-->", i + 4);
				if (close === -1) {
					break;
				}
				const marker = html.substring(i + 4, close);
				stack.at(-1).c.push({ t: "marker", m: marker });
				i = close + 3;
				continue;
			}
			if (html[i + 1] === "/") {
				i += 2;
				const tag = parseTagName(html, i);
				i = tag.cursor;
				while (i < html.length && html[i] !== ">") {
					i += 1;
				}
				i += 1;
				if (stack.length > 1) {
					stack.pop();
				}
				continue;
			}

			i += 1;
			const tag = parseTagName(html, i);
			i = tag.cursor;
			const attrs = {};
			i = parseAttributes(html, i, attrs);
			const selfClosing = html[i] === "/" && html[i + 1] === ">";
			i += selfClosing ? 2 : 1;

			const node = { t: "el", tag: tag.name, a: attrs, c: [] };
			stack.at(-1).c.push(node);
			if (!selfClosing) {
				stack.push(node);
			}
			continue;
		}

		let text = "";
		while (i < html.length && html[i] !== "<") {
			text += html[i];
			i += 1;
		}
		if (text) {
			stack.at(-1).c.push({ t: "txt", v: decodeEntities(text) });
		}
	}
	return root.c;
};

const planFromTemplate = (ast, bindings) => {
	const markerToIndex = new Map();
	const nodeToBindings = new Map();
	for (let i = 0; i < bindings.length; i++) {
		const binding = bindings[i];
		if (binding.marker) {
			markerToIndex.set(binding.marker, i);
		}
		if (binding.node) {
			if (!nodeToBindings.has(binding.node)) {
				nodeToBindings.set(binding.node, []);
			}
			nodeToBindings.get(binding.node).push(i);
		}
	}

	const build = (node) => {
		if (node.t === "txt") {
			return node;
		}
		if (node.t === "marker") {
			const bindingIndex = markerToIndex.get(node.m);
			return bindingIndex === undefined
				? { t: "txt", v: "" }
				: { t: "bind", i: bindingIndex };
		}

		const staticAttrs = {};
		const dynamicAttrs = [];
		const dynamicEvents = [];
		const nodeKey = node.a["data-uic-node"];
		const dynamicIndices = nodeKey ? nodeToBindings.get(nodeKey) || [] : [];

		for (const [name, value] of Object.entries(node.a)) {
			if (name === "data-uic-node") {
				continue;
			}
			staticAttrs[name] = value;
		}

		for (let i = 0; i < dynamicIndices.length; i++) {
			const index = dynamicIndices[i];
			const binding = bindings[index];
			if (binding.kind === "attr") {
				dynamicAttrs.push({ name: binding.name, i: index });
			} else if (binding.kind === "event") {
				dynamicEvents.push({ name: binding.event, i: index });
			}
		}

		const hasStaticAttrs = Object.keys(staticAttrs).length > 0;
		if (hasStaticAttrs) {
			Object.defineProperty(staticAttrs, STATIC_ATTRS_KEY, {
				value: true,
				enumerable: false,
			});
		}
		const hasDynamicAttrs = dynamicAttrs.length > 0;
		const hasDynamicEvents = dynamicEvents.length > 0;
		const children = node.c.map(build);

		return {
			t: "el",
			tag: node.tag,
			a: staticAttrs,
			ha: hasStaticAttrs,
			da: dynamicAttrs,
			de: dynamicEvents,
			hda: hasDynamicAttrs,
			hde: hasDynamicEvents,
			c: children,
			cc: children.length,
		};
	};

	return ast.map(build);
};

const createElementNode = (tag, attrs, children) => {
	return new VNode(
		undefined,
		tag === "" ? FRAGMENT_TAG : tag,
		createAttributes(attrs),
		normalizeChildren(children),
	);
};

const hoistStaticPlan = (plan) => {
	const visit = (node) => {
		if (node.t === "txt") {
			node.hs = true;
			node.sv = node.v;
			return true;
		}
		if (node.t === "bind") {
			node.hs = false;
			return false;
		}

		let allStatic = !node.hda && !node.hde;
		for (let i = 0; i < node.cc; i++) {
			if (!visit(node.c[i])) {
				allStatic = false;
			}
		}

		node.hs = allStatic;
		if (!allStatic) {
			return false;
		}

		const attrs = node.ha ? node.a : null;
		const children = new Array(node.cc);
		for (let i = 0; i < node.cc; i++) {
			children[i] = node.c[i].sv;
		}
		node.sv = createElementNode(node.tag, attrs, children);
		return true;
	};

	for (let i = 0; i < plan.length; i++) {
		visit(plan[i]);
	}
};

const bindingValue = (bindings, values, index) => {
	if (values !== undefined) {
		return values[index];
	}
	const binding = bindings[index];
	return binding?.get ? binding.get() : undefined;
};

const materialize = (node, bindings, values) => {
	if (node.t === "txt") {
		return node.v;
	}
	if (node.t === "bind") {
		return bindingValue(bindings, values, node.i);
	}
	if (node.hs) {
		return node.sv;
	}

	let attrs = null;
	if (node.hda || node.hde) {
		attrs = node.ha ? { ...node.a } : {};
		for (let i = 0; i < node.da.length; i++) {
			const d = node.da[i];
			attrs[d.name] = bindingValue(bindings, values, d.i);
		}
		for (let i = 0; i < node.de.length; i++) {
			const d = node.de[i];
			attrs[d.name] = bindingValue(bindings, values, d.i);
		}
	} else if (node.ha) {
		attrs = node.a;
	}

	if (node.cc === 0) {
		return createElementNode(node.tag, attrs, []);
	}
	const children = new Array(node.cc);
	for (let i = 0; i < node.cc; i++) {
		children[i] = materialize(node.c[i], bindings, values);
	}
	return createElementNode(node.tag, attrs, children);
};

const getPlan = (html, bindings) => {
	if (bindings && bindings.length > 0) {
		const byHtml = PLAN_CACHE_BY_BINDINGS.get(bindings);
		if (byHtml) {
			const cached = byHtml.get(html);
			if (cached) {
				return cached;
			}
		}
	}

	const sig = signatureOf(bindings);
	const key = `${html}\n${sig}`;
	let plan = PLAN_CACHE.get(key);
	if (!plan) {
		let ast = TEMPLATE_AST_CACHE.get(html);
		if (!ast) {
			ast = parseTemplateAst(html);
			TEMPLATE_AST_CACHE.set(html, ast);
		}
		plan = planFromTemplate(ast, bindings);
		hoistStaticPlan(plan);
		PLAN_CACHE.set(key, plan);
	}

	if (bindings && bindings.length > 0) {
		let byHtml = PLAN_CACHE_BY_BINDINGS.get(bindings);
		if (!byHtml) {
			byHtml = new Map();
			PLAN_CACHE_BY_BINDINGS.set(bindings, byHtml);
		}
		byHtml.set(html, plan);
	}

	return plan;
};

export const compiled = (html, bindings = [], ...values) => {
	const dynamicValues = values.length ? values : undefined;
	const plan = getPlan(html, bindings);
	if (plan.length === 1) {
		return materialize(plan[0], bindings, dynamicValues);
	}
	const children = new Array(plan.length);
	for (let i = 0; i < plan.length; i++) {
		children[i] = materialize(plan[i], bindings, dynamicValues);
	}
	return createElementNode("", null, children);
};

// EOF
