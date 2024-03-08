// --
// This is an experiment in trying to beat Preact at the `inspector-speed`
// test, in order to find a faster way to do the first render. At this point,
// I'm quite happy with `ui.js`'s speed of development, and also its interactive
// speed past the first render (esp. with lots of data), but the initial
// render needs to improve.

export const RawObjectPrototype = Object.getPrototypeOf({});
export const isObject = (value) =>
	value && Object.getPrototypeOf(value) === RawObjectPrototype ? true : false;

// ----------------------------------------------------------------------------
//
// CELLS SELECTIONS
//
// ----------------------------------------------------------------------------

class Cell {
	static Count = 0;

	// --
	// Takes a data structure containing cells, and retrieves values
	// defined in context mapping the cell id to the value.
	static Eval(data, context) {
		if (data instanceof Cell) {
			return context[data.id];
		} else if (data instanceof Array) {
			return data.map((_) => Cell.Eval(_, context));
		} else if (data instanceof Map) {
			const r = new Map();
			for (const [k, v] of data.entries()) {
				r.set(k, Cell.Eval(v, context));
			}
			return r;
		} else if (isObject(data)) {
			const r = {};
			for (const k in data) {
				r[k] = Cell.Eval(data[k], context);
			}
			return r;
		} else {
			return data;
		}
	}

	constructor(input = null) {
		this.id = Cell.Count++;
		this.input = input;
	}
	apply(value) {
		return value;
	}
}

// ----------------------------------------------------------------------------
//
// DATA SELECTIONS
//
// ----------------------------------------------------------------------------

class Selectable extends Cell {
	get entries() {
		return new Derivation(this, Object.entries);
	}

	then(func) {
		return new Derivation(this, func);
	}

	fmt(text) {
		// TODO: Should expand the slots
		return new Derivation(this, () => text);
	}

	// if(...branches) {
	// 	console.log("IF", { branches })
	// 	return this;
	// }

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

	map(transform) {
		return new MappedEffect(this, template(transform));
	}
}

// ----------------------------------------------------------------------------
//
// DATA TRANSFORMS
//
// ----------------------------------------------------------------------------

class Derivation extends Selectable {
	constructor(input, operation) {
		super(input);
		this.operation = operation;
		this.args = operation ? prototype(operation) : null;
	}
	apply(value) {
		return this.operation ? this.operation(value) : value;
	}
}

// ----------------------------------------------------------------------------
//
// PRESENTATION EFFECTS
//
// ----------------------------------------------------------------------------

class UIOperation {
	constructor(node, operation, args) {
		this.node = node;
		this.operation = operation;
		this.args = args;
	}
}

class Effect extends Selectable {
	apply(value) {
		console.error("Effect.apply not implemented", this);
	}
}

class AttributeEffect extends Effect {}

class ConditionalEffect extends Effect {
	constructor(selection, branches) {
		super(selection);
		this.branches = branches;
	}

	apply(value) {
		for (const [v, f, result] of this.branches) {
			if ((v !== undefined && value === v) || (f && f(value))) {
				return result;
			}
		}
		return null;
	}
}
class MappedEffect extends Effect {
	constructor(selection, template) {
		super(selection);
		this.template = template;
	}

	apply(value) {
		const res = [];
		for (const k in value) {
			const v = value[k];
			const s = new RenderState(this.template);
			const r = s.apply(v);
			res.push(r);
		}
		console.log("MAPPED EFFECT RESULT", res);
		return res;
	}
}

// ----------------------------------------------------------------------------
//
// SLOTS
//
// ----------------------------------------------------------------------------

const FIELD_SEP = String.fromCharCode(31);

class Slot extends Selectable {
	static Count = 0;
	constructor(name, index = null) {
		super(null);
		this.name = name;
		this.index = index;
		this.children = undefined;
		this.selection = [this];
	}
	toString() {
		return `${FIELD_SEP}{${this.id}}${FIELD_SEP}`;
	}
}

class Selection extends Selectable {
	constructor(selection) {
		super([...cellsOf(selection)]);
		this.selection = selection;
	}
}

export function* matchesOf(template, data) {
	if (template instanceof Slot) {
		yield [template, data];
	} else if (template instanceof Map) {
		const is_map = data instanceof Map;
		if (data !== null && data !== undefined) {
			for (const k of template.keys()) {
				for (const _ of matchesOf(
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
				for (const _ of matchesOf(
					template[k],
					is_map ? data.get(k) : data[k]
				)) {
					yield _;
				}
			}
		}
	}
	// TODO: We could have a strict mode to see if that matches
}
export const matches = (template, data) => [...matchesOf(template, data)];

export function* cellsOf(template, path = []) {
	if (template instanceof Cell) {
		yield [template, path];
	} else if (template instanceof Map) {
		for (const [k, v] of template.entries()) {
			for (const _ of cellsOf(v, [...path, k])) {
				yield _;
			}
		}
	} else if (template instanceof Object) {
		for (const k in template) {
			for (const _ of cellsOf(template[k], [...path, k])) {
				yield _;
			}
		}
	}
}
export const cells = (template, data) => [...cellsOf(template, data)];

// ----------------------------------------------------------------------------
//
// UTILITIES
//
// ----------------------------------------------------------------------------

// --
// Retrieves the arguments from a function declaration.
export const prototype = (func) => {
	// We extract the args
	const t = func.toString();
	const i = t.indexOf("(");
	let j = t.indexOf(")");
	j = j < 0 ? t.indexOf("=>") : j;
	const declaration = t.slice(i >= 0 ? i + 1 : 0, j >= 0 ? j : t.length);
	const n = declaration.length;
	// Now we do the parsing
	const args = [];
	// Path is the access path from the parent structure.
	const path = [];
	// That'ths the offset
	let o = 0;
	let position = 0;
	let token = 0;
	let rest = false;
	let name = undefined;
	let key = undefined;
	while (o < n) {
		const c = declaration.charAt(o);
		switch (c) {
			case "{":
			case "[":
				token = key = undefined;
				path.push(position);
				rest = false;
				position = c === "[" ? 0 : undefined;
				break;
			case "}":
			case "]":
				name = declaration.substring(token, o);
				token !== undefined &&
					args.push({
						name,
						path: [
							...path,
							position == undefined ? key || name : position,
						],
						rest,
					});
				token = undefined;
				rest = false;
				position = path.pop();
				break;
			case ":":
				key = declaration.substring(token, o);
				rest = false;
				token = undefined;
				break;
			case ",":
			case ".":
			case " ":
				name = declaration.substring(token, o);
				rest = c === "." ? true : c === "," ? false : rest;
				token !== undefined &&
					args.push({
						name,
						path: [
							...path,
							position == undefined ? key || name : position,
						],
						rest,
					});
				token = undefined;
				position =
					c === "," && position !== undefined
						? position + 1
						: position;
				break;
			default:
				token = token === undefined ? o : token;
				break;
		}
		o++;
	}
	name = declaration.substring(token, o);
	token !== undefined &&
		args.push({
			name,
			path: [...path, position == undefined ? key || name : position],
			rest,
		});
	return { declaration, args };
};

// --
// Standard assign function
export const assign = (scope, path, value) => {
	let s = scope;
	const n = path.length - 1;
	for (let i = 0; i <= n; i++) {
		const k = path[i];
		if (i === n) {
			s[k] = value;
		} else if (s[k] === undefined || s[k] === null) {
			s[k] = typeof path[i + 1] === "number" ? [] : {};
		}
		s = s[k];
	}
	return scope;
};

// ----------------------------------------------------------------------------
//
// TEMPLATES
//
// ----------------------------------------------------------------------------

class Template {
	static All = new Map();
	constructor(input, output) {
		this.input = input;
		this.output = output;
		// The derivations is a forward map, so that we know when a given
		// input changes, which other inputs need to be changed.
		const derivations = new Map();
		const queue = output instanceof VNode ? output.cells : [output];
		const cells = new Map();
		while (queue.length) {
			const output = queue.pop();
			if (!cells.has(output.id)) {
				for (const [input] of cellsOf(output.input)) {
					if (!derivations.has(input.id)) {
						derivations.set(input.id, []);
					}
					derivations.get(input.id).push(output.id);
					if (!cells.has(input.id)) {
						queue.push(input);
					}
				}
				cells.set(output.id, output);
			}
		}
		//
		this.derivations = derivations;
		this.cells = cells;
	}
}

export const template = (declarator) => {
	// We get the paths for the arguments
	const [_, proto] = prototype(declarator);
	// We create corresponding slots
	const slots = [];
	const input = proto.reduce((r, { path, name }) => {
		const s = new Slot(name);
		slots.push(s);
		return assign(r, path, s);
	}, []);
	// And we pass them to the function declarator
	return new Template(input, declarator(...input));
};

// ----------------------------------------------------------------------------
//
// COMPONENTS
//
// ----------------------------------------------------------------------------

const Components = new Map();
export const component = (declarator) => {
	if (declarator instanceof Template) {
		return declarator;
	} else if (Components.has(declarator)) {
		return Components.get(declarator);
	} else {
		const t = template(declarator);
		Components.set(declarator, t);
		return t;
	}
};

// ----------------------------------------------------------------------------
//
// RENDERING/UNIFICATION
//
// ----------------------------------------------------------------------------

class RenderState {
	constructor(template, parent = undefined) {
		this.template = template;
		this.context = Object.create(parent ? parent.context : {});
		this.updated = Object.create(parent ? parent.updated : {});
		this.revision = 0;
		this.states = new Map();
	}

	apply(value) {
		// We apply the value, and extract the slot values for each slot
		// in the template input. This populates the state.
		const queue = [];
		const rev = this.revision++;
		// First step is to populate the context with the extracted slot
		// value from the arguments.
		console.log("XXX TEMPLATE", { value }, this.template);
		for (const [s, v] of matchesOf(this.template.input, value)) {
			this.context[s.id] = v;
			queue.push(s);
		}
		// Now, we play back the derivations, updating values in cascade,
		// following the template's derivation map.
		const derivations = this.template.derivations;
		while (queue.length) {
			const cell = queue.pop();
			const derived = derivations.get(cell.id);
			console.log("XXX TRIGGER", cell.id);
			if (derived) {
				for (const cid of derived) {
					// We skip any cell that already has been processed in this
					// update cycle.
					if ((this.updated[cid] || -1) < rev) {
						// We get the cell, evaluate the corresponding value for
						// its input, and pass it to apply.
						const output = this.template.cells.get(cid);
						const value = output.apply(
							Cell.Eval(output.input, this.context)
						);
						// TODO: Value may be a VNode, in which case the values
						// may not have been updated as part of derivations. For instance
						// conditionals.

						// We store the result in the context
						this.context[cid] = value;
						this.updated[cid] = rev;
						// And schedule further derivations for processing.
						if (derivations.has(cid)) {
							queue.push(output);
						}
					}
				}
			}
		}
		// At this point the context is fully populated with outputs, we just
		// need to retrieve the output value of the output
		const res = this.context[this.template.output.id];
		return res;
	}

	render(node, output) {
		const state = this.states.get(node);
		// We create
		if (!state) {
			if (output instanceof VNode) {
				const res = output.render(this.context);
				node.appendChild(res);
				this.states.set(node, res);
			} else {
				console.warn("Output is not a VNode", { output });
			}
		} else {
		}
	}
}

const unify = (template, data, node, context = new RenderState(template)) => {
	const output = context.apply(data);
	context.render(node, output);
	return context;
};

// ----------------------------------------------------------------------------
//
// HTML FACTORY
//
// ----------------------------------------------------------------------------

function* cellsOfVNode(node, path = []) {
	let i = 0;
	for (const child of node.children) {
		if (child instanceof Cell) {
			yield [child, [...path, i]];
		} else if (child instanceof VNode) {
			for (const _ of cellsOfVNode(child, [...path, i])) {
				yield _;
			}
		}
		i++;
	}
}

class VNode {
	constructor(ns, name, ...children) {
		this.ns = ns;
		this.name = name;
		this.children = children;
		// NOTE: Maybe an imperative version would be faster?
		this.cells = children.reduce(
			(r, v) =>
				v instanceof VNode
					? [...r, ...v.cells]
					: v instanceof Cell
					? [...r, v]
					: r,
			[]
		);
	}

	render(context) {
		const res = this.ns
			? document.createElementNS(this.ns, this.name)
			: document.createElement(this.name);
		for (const child of this.children) {
			let v = child;
			if (v instanceof Cell) {
				if (context[child.id] === undefined) {
					context[child.id] = v = child.apply(
						Cell.Eval(child.input, context)
					);
				}
			}
			if (v === undefined || v === null) {
				// pass
			} else if (v instanceof VNode) {
				res.appendChild(v.render(context));
			} else if (isObject(v)) {
				for (const k in v) {
					const w = k[v];
					switch (k) {
						case "class":
						case "_":
							if (w === undefined) {
								//pass
							} else if (w === null) {
								res.removeAttribute("class");
							} else {
								for (const _ of w.split(" ")) {
									res.classList.add(_);
								}
							}
							break;
						default:
							// TODO: Event handlers, style, value
							if (w === undefined) {
								//pass
							} else if (w === null) {
								res.removeAttribute(k);
							} else {
								res.setAttribute(k, `${w}`);
							}
					}
				}
			} else {
				res.appendChild(document.createTextNode(`${v}`));
			}
		}
		return res;
	}
}

class FactoryProxy {
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
export const h = new Proxy(new Map(), new FactoryProxy());

// ----------------------------------------------------------------------------
//
// HIGH LEVEL API
//
// ----------------------------------------------------------------------------

export const select = (...slots) => {
	return new Selection(slots);
};

export const $ = select;

export const render = (definition, data, node, context = null) =>
	unify(component(definition), data, node);
// EOF
