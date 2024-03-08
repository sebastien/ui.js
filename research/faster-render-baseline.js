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
}

export function* matchedCells(template, data) {
	if (template instanceof Cell) {
		if (template.input) {
			for (const _ of matchedCells(template.input)) {
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
}

class TemplateEffect extends Effect {
	constructor(inputs, template, args, name) {
		super(inputs);
		this.template = template;
		// NOTE: Not in input, the inputs are actually
		this.args = args;
		this.name = name;
	}
}

class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
	}
}

class FormattingEffect extends Effect {
	constructor(input, format) {
		super(input);
		this.format = format;
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

class DummyEffector {
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
		return document.createTextNode(`${text}`);
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
		return node;
	}
}
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
		parent && parent.appendChild(document.createTextNode(`${text}`));
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
		parent && parent.appendChild(node);
		return node;
	}
}

class DeferredDOMEffector {
	constructor() {
		this.operations = [];
		this.mappings = new Map();
	}
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
		if (position instanceof Array) {
			position = position[0] + position[1];
		}
		this.operations.splice(0, 0, [
			parent,
			position,
			document.createTextNode(text),
		]);
	}

	ensureAttribute(node, ns, name, value) {
		if (ns) {
			node.setAttributeNS(ns, name, value);
		} else {
			node.setAttribute(name, value);
		}
	}

	ensureNode(parent, position, ns, name) {
		if (position instanceof Array) {
			position = position[0] + position[1];
		}
		const node = ns
			? document.createElementNS(ns, name)
			: document.createElement(name);
		this.operations.splice(0, 0, [parent, position, node]);
		return node;
	}
	flush() {
		let item = null;
		while ((item = this.operations.pop())) {
			const [parent, position, node] = item;
			// let n = parent.childNodes.length - position;
			// while (n-- >= 0) {
			// 	parent.appendChild(document.createComment("P"));
			// }
			const existing = null; // parent.childNodes[position];
			existing
				? parent.replaceChild(node, existing)
				: parent.appendChild(node);
		}
	}
}

// ----------------------------------------------------------------------------
//
// RENDERING
//
// ----------------------------------------------------------------------------

const getContext = (cell, data, context) => {
	if (cell instanceof Injection) {
		const derived = context[cell.id] ?? Object.create(context);
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of matchedCells(cell.args, data)) {
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
	context =
		template instanceof Cell
			? getContext(template, data, context)
			: context;
	if (template instanceof TemplateEffect) {
		return _render(
			template.template,
			data,
			node,
			position,
			effector,
			context
		);
	} else if (template instanceof ConditionalEffect) {
		const current = context[template.input.id];
		let match = undefined;
		for (const [value, predicate, branch] of template.branches) {
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
		return _render(match, data, node, position, effector, context);
	} else if (template instanceof MappingEffect) {
		const mapping = template;
		const input = context[template.input.id];
		let i = 0;
		for (const k in input) {
			_render(
				mapping.template,
				[input[k], k],
				node,
				[position, i++],
				effector,
				context
			);
		}
		// TODO: We should clear any node that has been removed
		//
	} else if (template instanceof FormattingEffect) {
		const effect = template;
		const text = context[effect.input.id];
		effector.ensureText(node, position, text);
	} else if (template instanceof Cell) {
		effector.ensureContent(node, position, context[template.id]);
	} else if (template instanceof VNode) {
		const vnode = template;
		node = effector.ensureNode(node, position, vnode.ns, vnode.name);
		let i = 0;
		for (const [[ns, name], value] of vnode.attributes.entries()) {
			effector.ensureAttribute(node, ns, name, value);
		}
		for (const child of vnode.children) {
			_render(child, data, node, i, effector, context);
			i++;
		}
		return node;
	} else {
		console.error("Unsupported template type", {
			type: typeof template,
			template,
		});
	}
	return node;
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
	const res = _render(template(component), data, null, position);
	// Appending only at the end is the best way to speed up the initial rendering.
	node.appendChild(res);
	return res;
};

// EOF
