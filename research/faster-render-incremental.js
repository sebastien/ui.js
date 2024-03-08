import { prototype, assign } from "./faster-render.js";

// ----------------------------------------------------------------------------
//
// HTML IN JAVASCRIPT
//
// ----------------------------------------------------------------------------

class VNode {
	constructor(ns, name, attributes, ...children) {
		this.ns = ns;
		this.name = name;
		this.attributes = attributes;
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
			const res = (...args) =>
				new VNode(this.namespace, property, ...args);
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
	constructor() {
		this.id = Cell.Id++;
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
	constructor(inputs, template, args) {
		super(inputs);
		this.template = template;
		// NOTE: Not in input, the inputs are actually
		this.args = args;
	}
}

class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
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
	get entries() {
		return this.then(Object.entries);
	}

	then(func) {
		return new Derivation(this, func);
	}

	fmt(text) {
		return new Derivation(this, () => text);
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

export const select = (...slots) => {
	return new Selection(slots);
};

export const $ = select;

// ----------------------------------------------------------------------------
//
// EFFECTOR
//
// ----------------------------------------------------------------------------

class DOMEffector {
	ensureNode(parent, position, ns, name) {
		const existing = parent.childNodes[position];
		if (existing) {
			console.log("TODO: EnsureNode/Existing");
			return existing;
		} else {
			const node = ns
				? document.createElementNS(ns, name)
				: document.createElement(name);
			while (parent.childNodes.length < position - 1) {
				parent.appendChild(
					document.createComment(`P${parent.childNodes.length}`)
				);
			}
			parent.appendChild(node);
			return node;
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
		console.log("Unsupported cell", cell);
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
	const parent = context;
	context =
		template instanceof Cell
			? getContext(template, data, context)
			: context;
	if (template instanceof TemplateEffect) {
		_render(template.template, data, node, position, effector, context);
	} else if (template instanceof ConditionalEffect) {
		const current = context[template.input.id];
		for (const [value, predicate, branch] of template.branches) {
			if (
				(value !== undefined && value === current) ||
				(predicate && predicate(current))
			) {
				_render(branch, data, node, position, effector, context);
				break;
			}
		}
	} else if (template instanceof MappingEffect) {
		const mapping = template;
		console.log(
			"MAPPING EFFECT",
			mapping,
			context[mapping.input.id],
			"/",
			parent[mapping.input.id]
		);
		console.log("CONTEXT", context);
	} else if (template instanceof Cell) {
		console.log("CELL", template);
	} else if (template instanceof VNode) {
		const vnode = template;
		node = effector.ensureNode(node, position, vnode.ns, vnode.name);
		let i = 0;
		for (const child of vnode.children) {
			_render(child, data, node, i, effector, context);
			i++;
		}
	} else {
		console.error("Unsupported template type", {
			type: typeof template,
			template,
		});
	}
	return context;
}

// ----------------------------------------------------------------------------
//
// TEMPLATES
//
// ----------------------------------------------------------------------------

const template = (component) => {
	const args = [];
	for (const { path, name } of prototype(component).args) {
		const input = new Argument(name);
		assign(args, path, input);
	}
	return new TemplateEffect(new Injection(args), component(...args));
};

export const render = (
	component,
	data,
	node,
	position = node.childNodes.length
) => {
	return _render(template(component), data, node, position);
};

// EOF
