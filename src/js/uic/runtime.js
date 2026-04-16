import { h } from "../ui/hyperscript.js";

const TEMPLATE_AST_CACHE = new Map();
const PLAN_CACHE = new Map();

const decodeEntities = (value) =>
	value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

const signatureOf = (bindings) =>
	bindings
		.map((binding) =>
			[
				binding.kind || "",
				binding.node || "",
				binding.marker || "",
				binding.name || "",
				binding.event || "",
			].join("|"),
		)
		.join(";");

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

		return {
			t: "el",
			tag: node.tag,
			a: staticAttrs,
			da: dynamicAttrs,
			de: dynamicEvents,
			c: node.c.map(build),
		};
	};

	return ast.map(build);
};

const materialize = (node, bindings) => {
	if (node.t === "txt") {
		return node.v;
	}
	if (node.t === "bind") {
		return bindings[node.i].get();
	}

	let attrs = node.a;
	if (node.da.length || node.de.length) {
		attrs = Object.keys(node.a).length ? { ...node.a } : {};
		for (let i = 0; i < node.da.length; i++) {
			const d = node.da[i];
			attrs[d.name] = bindings[d.i].get();
		}
		for (let i = 0; i < node.de.length; i++) {
			const d = node.de[i];
			attrs[d.name] = bindings[d.i].get();
		}
	}

	const children = node.c.map((_) => materialize(_, bindings));
	return h(node.tag, Object.keys(attrs).length ? attrs : null, ...children);
};

const getPlan = (html, bindings) => {
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
		PLAN_CACHE.set(key, plan);
	}
	return plan;
};

export const compiled = (html, bindings = []) => {
	const plan = getPlan(html, bindings);
	if (plan.length === 1) {
		return materialize(plan[0], bindings);
	}
	return h("", null, ...plan.map((_) => materialize(_, bindings)));
};

// EOF
