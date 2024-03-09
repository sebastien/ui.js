import { prototype, assign } from "./faster-render.js";

const FIELD_SEP = String.fromCharCode(31);

export const RawObjectPrototype = Object.getPrototypeOf({});
export const isObject = (value) =>
	value && Object.getPrototypeOf(value) === RawObjectPrototype ? true : false;

// ----------------------------------------------------------------------------
//
// HTML IN JAVASCRIPT
//
// ----------------------------------------------------------------------------

function* iterVNodeCells(node, path = []) {
	for (let i = 0; i < node.children.length; i++) {
		const v = node.children[i];
		if (v instanceof Cell) {
			yield [[...path, i], v];
		} else if (v instanceof VNode) {
			for (const _ of iterVNodeCells(v, [...path, i])) {
				yield _;
			}
		}
	}
}
class VNode {
	constructor(ns, name, attributes, children) {
		this.ns = ns;
		this.name = name;
		this.attributes = new Map();
		for (const k in attributes) {
			let [ns, name] = k.split(":");
			if (!name) {
				name = ns;
				ns = undefined;
			}
			if (name === "_") {
				name = "class";
			}
			this.attributes.set([ns, name], attributes[k]);
		}
		this.children = children;
		this.template = this.materialize();
		this._effects = null;
	}

	get effects() {
		if (!this._effects) {
			this._effects = [...iterVNodeCells(this)];
		}
		return this._effects;
	}

	clone() {
		return this.template.cloneNode(true);
	}

	materialize() {
		const node = document.createElement(this.name);
		for (const [[ns, name], value] of this.attributes.entries()) {
			node.setAttribute(name, value);
		}
		for (const child of this.children) {
			if (child instanceof Cell) {
				node.appendChild(document.createComment(child.toString()));
			} else if (child instanceof Node) {
				node.appendChild(child.cloneNode(true));
			} else if (child instanceof VNode) {
				node.appendChild(child.clone());
			} else if (child !== null && child !== undefined) {
				node.appendChild(document.createTextNode(`${child}`));
			}
		}
		return node;
	}

	// NOTE: Leaving this version of rendering that is creating the nodes
	// as is as opposed to cloning
	// render(data, parent, position, context, effector) {
	// 	const node = effector.ensureNode(parent, position, this.ns, this.name);
	// 	let i = 0;
	// 	for (const [[ns, name], value] of this.attributes.entries()) {
	// 		effector.ensureAttribute(node, ns, name, value);
	// 	}
	// 	for (const child of this.children) {
	// 		_render(child, data, node, i, effector, context);
	// 		i++;
	// 	}
	// 	return node;
	// }

	render(data, parent, position, context, effector) {
		const node = this.clone();
		for (const [path, effect] of this.effects) {
			const child = path.reduce((r, v) => r.childNodes[v], node);
			_render(effect, data, child, position, effector, context);
			// It's a first render, so we keep track of the placeholder
			child.parentNode.removeChild(child);
		}
		return effector.appendChild(parent, node);
	}
}

class VDOMFactoryProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		if (scope.has(property)) {
			return scope.get(property);
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
			scope.set(property, res);
			return res;
		}
	}
}
export const h = new Proxy(new Map(), new VDOMFactoryProxy());

// ----------------------------------------------------------------------------
//
// DATAFLOW
//
// ----------------------------------------------------------------------------

class Cell {
	static Id = 0;
	// static All = new Map();
	constructor() {
		this.id = Cell.Id++;
		// Cell.All.set(this.id, All);
	}
	toString() {
		return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
	}

	render(data, node, position, context, effector) {
		effector.ensureContent(node, position, context[this.id]);
	}
}

export function* matchedCells(template, data) {
	if (template instanceof Cell) {
		if (template.input) {
			for (const _ of matchedCells(template.input, data)) {
				yield _;
			}
		}
		yield [template, data];
	} else if (template instanceof Map) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k of template.keys()) {
				for (const _ of matchedCells(
					template[k],
					is_map ? data.get(k) : data[k]
				)) {
					yield _;
				}
			}
		}
	} else if (template instanceof Object) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k in template) {
				for (const _ of matchedCells(
					template[k],
					is_map ? data.get(k) : data[k]
				)) {
					yield _;
				}
			}
		}
	}
}

export function matchedCells2(template, data, res = []) {
	if (template instanceof Cell) {
		if (template.input) {
			matchedCells2(template.input, data, res);
		}
		res.push([template, data]);
	} else if (template instanceof Map) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k of template.keys()) {
				matchedCells2(template[k], is_map ? data.get(k) : data[k], res);
			}
		}
	} else if (template instanceof Object) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k in template) {
				matchedCells2(template[k], is_map ? data.get(k) : data[k], res);
			}
		}
	}
	return res;
}

export function matchedCells3(template, data) {
	let res = [];
	if (template instanceof Cell) {
		if (template.input) {
			res = [...res, ...matchedCells3(template.input, data, res)];
		}
		res.push([template, data]);
	} else if (template instanceof Map) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k of template.keys()) {
				res = [
					...res,
					...matchedCells3(
						template[k],
						is_map ? data.get(k) : data[k],
						res
					),
				];
			}
		}
	} else if (template instanceof Object) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k in template) {
				res = [
					...res,
					...matchedCells3(
						template[k],
						is_map ? data.get(k) : data[k],
						res
					),
				];
			}
		}
	}
	return res;
}

// ----------------------------------------------------------------------------
//
// EFFECTS
//
// ----------------------------------------------------------------------------

class Effect extends Cell {
	constructor(input) {
		super();
		this.input = input;
	}
}

class ConditionalEffect extends Effect {
	constructor(input, branches) {
		super(input);
		this.branches = branches;
	}
	render(data, node, position, context, effector) {
		const current = context[this.input.id];
		let match = undefined;
		for (const [value, predicate, branch] of this.branches) {
			if (!match && value === "" && !predicate) {
				match = branch;
			} else if (
				(value !== undefined && value === current) ||
				(predicate && predicate(current))
			) {
				match = branch;
				break;
			}
		}
		_render(match, data, node, position, effector, context);
	}
}

class TemplateEffect extends Effect {
	constructor(inputs, template, args, name) {
		super(inputs);
		this.template = template;
		// NOTE: Not in input, the inputs are actually
		this.args = args;
		this.name = name;
	}
	render(data, node, position, context, effector) {
		_render(this.template, data, node, position, effector, context);
	}
}

class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
	}
	render(data, node, position, context, effector) {
		const input = context[this.input.id];
		let i = 0;
		for (const k in input) {
			_render(
				this.template,
				[input[k], k],
				node,
				[position, i++],
				effector,
				context
			);
		}
		// TODO: We should clear any node that has been removed
		//
	}
}

class FormattingEffect extends Effect {
	constructor(input, format) {
		super(input);
		this.format = format;
	}
	render(data, node, position, context, effector) {
		const text = context[this.input.id];
		effector.ensureText(node, position, text);
	}
}

// ----------------------------------------------------------------------------
//
// SELECTION
//
// ----------------------------------------------------------------------------

class Injection extends Cell {
	constructor(args) {
		super();
		this.args = args;
	}
}

// ----------------------------------------------------------------------------
//
// SELECTION
//
// ----------------------------------------------------------------------------

class Selection extends Cell {
	then(func) {
		return new Derivation(this, func);
	}

	fmt(text) {
		// FIXME: Not that
		return new FormattingEffect(this, () => text);
	}

	apply(tmpl) {
		return new TemplateEffect(this, template(tmpl));
	}

	match(cases) {
		const branches = [];
		// TODO: we should do parsing here
		for (const [k, v] of Object.entries(cases)) {
			for (const _ of k.split(",")) {
				branches.push([_, null, v]);
			}
		}
		return new ConditionalEffect(this, branches);
	}
	map(component) {
		return new MappingEffect(this, template(component));
	}
}

class Argument extends Selection {
	constructor(name) {
		super(name);
		this.name = name;
	}
}

class Derivation extends Selection {
	constructor(input, transform) {
		super();
		this.input = input;
		this.transform = transform;
	}
}

export const select = (args) =>
	args instanceof Selection ? args : new Selection(new Injection(args));

export const $ = select;

// ----------------------------------------------------------------------------
//
// EFFECTOR
//
// ----------------------------------------------------------------------------

class DOMEffector {
	ensureContent(parent, position, content) {
		const t = typeof content;
		if (content === null || content === undefined) {
			// pass
		} else if (t === "string") {
			return this.ensureText(parent, position, content);
		} else if (t === "number") {
			return this.ensureText(parent, position, `${content}`);
		} else {
			console.error("Unsupported content", { content });
		}
	}

	ensureText(parent, position, text) {
		this.appendChild(parent, document.createTextNode(`${text}`));
	}

	ensureAttribute(node, ns, name, value) {
		if (ns) {
			node.setAttributeNS(ns, name, `${value}`);
		} else {
			node.setAttribute(name, `${value}`);
		}
	}

	ensureNode(parent, position, ns, name) {
		const node = ns
			? document.createElementNS(ns, name)
			: document.createElement(name);
		return this.appendChild(parent, node);
	}

	appendChild(parent, child) {
		if (!parent) {
			return child;
		}
		if (parent.nodeType === Node.COMMENT_NODE) {
			parent.parentNode.insertBefore(child, parent);
		} else {
			parent.appendChild(child);
		}
		return child;
	}
}

// ----------------------------------------------------------------------------
//
// RENDERING
//
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
//
// NOTE: This doesn't make a lot of sense, but here using applyContext,
// we lose about 150ms of scripting time. While the original getContext
// remains faster.
export function applyContext(template, data, context = {}) {
	if (template instanceof Cell) {
		if (template.input) {
			applyContext(template.input, data, context);
		}
		context[template.id] = data;
	} else if (template instanceof Map) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k of template.keys()) {
				applyContext(
					template[k],
					is_map ? data.get(k) : data[k],
					context
				);
			}
		}
	} else if (template instanceof Object) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k in template) {
				applyContext(
					template[k],
					is_map ? data.get(k) : data[k],
					context
				);
			}
		}
	}
	return context;
}
const getContextB = (cell, data, context) => {
	if (cell instanceof Injection) {
		return applyContext(
			cell.args,
			data,
			context[cell.id] ?? Object.create(context)
		);
	} else if (cell instanceof Derivation) {
		context[cell.id] = cell.transform(context[cell.input.id]);
		return context;
	} else if (cell instanceof Cell) {
		if (cell.input) {
			const derived = getContext(cell.input, data, context);
			return derived;
		} else {
			return context;
		}
	} else {
		console.error("Unsupported cell", cell);
		return context;
	}
};

const getContext = (cell, data, context) => {
	if (cell instanceof Injection) {
		const derived = context[cell.id] ?? Object.create(context);
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of matchedCells2(cell.args, data)) {
			derived[c.id] = v;
		}
		return derived;
	} else if (cell instanceof Derivation) {
		context[cell.id] = cell.transform(context[cell.input.id]);
		return context;
	} else if (cell instanceof Cell) {
		if (cell.input) {
			const derived = getContext(cell.input, data, context);
			return derived;
		} else {
			return context;
		}
	} else {
		console.error("Unsupported cell", cell);
		return context;
	}
};

const globalContext = {};
const globalEffector = new DOMEffector();

function _render(
	template,
	data,
	node,
	position,
	effector = globalEffector,
	context = globalContext
) {
	if (!template) {
	} else if (template instanceof VNode) {
		return template.render(data, node, position, context, effector);
	} else {
		return template.render(
			data,
			node,
			position,
			getContext(template, data, context),
			effector
		);
	}
}

// ----------------------------------------------------------------------------
//
// TEMPLATES
//
// ----------------------------------------------------------------------------

const template = (component) => {
	if (component.template) {
		return component.template;
	} else {
		const args = [];
		for (const { path, name } of prototype(component).args) {
			const input = new Argument(name);
			assign(args, path, input);
		}
		const res = (component.template = new TemplateEffect(
			new Injection(args),
			undefined,
			args,
			component.name
		));
		res.template = component(...args);
		return res;
	}
};

export const render = (
	component,
	data,
	node,
	position = node.childNodes.length
) => {
	const ctx = document.createDocumentFragment();
	const res = _render(template(component), data, ctx, position);
	// Appending only at the end is the best way to speed up the initial rendering.
	node.appendChild(ctx);
	console.log("RENDER", { res, ctx });

	return ctx;
};

// EOF
