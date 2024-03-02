
class TNode {
	constructor(ns, name, ...children) {
		this.ns = ns
		this.name = name
		this.children = children;
	}

}

class FactoryProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		if (scope.has(property)) {
			return scope.get(property)
		} else {
			const res = (...args) => new TNode(this.namespace, property, ...args)
			scope.set(property, res)
			return res
		}
	}
}

class Selectable {
	constructor(selection = null) {
		this.selection = selection;
	}

	get entries() {
		return new ApplicationTransform(this, Object.entries);
	}

	fmt(text) {
		// TODO: Should expand the slots
		return new ApplicationTransform(this, () => text)
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
				branches.push([_, v])
			}
		}
		return new ConditionalEffect(this, branches);
	}

	map(transform) {
		template(transform)
		return this;
	}


}


class ApplicationTransform extends Selectable {
	constructor(input, operation) {
		super(input);
		this.operation = operation;
	}
	apply(value) {
		return this.operation ? this.operation(value) : value;
	}
}

class Effect extends Selectable { }

class AttributeEffect extends Effect { }
class ConditionalEffect extends Effect {
	constructor(selection, branches) { super(selection); this.branches = branches }
}
class MappedEffect extends Effect { }


const FIELD_SEP = String.fromCharCode(31);

class Slot extends Selectable {
	static Count = 0;
	constructor(name, index = null) {
		super();
		this.id = Slot.Count++;
		this.name = name;
		this.index = index;
		this.children = undefined;
		this.selection = [this];
	}
	toString() { return `${FIELD_SEP}{${this.id}}${FIELD_SEP}` }
}

class Selection extends Selectable { }

// --
// Retrieves the arguments from a function declaration.
export const prototype = (func) => {
	// We extract the args
	const t = func.toString();
	const i = t.indexOf("(");
	const j = t.indexOf(")");
	const argdef = t.slice(i >= 0 ? i + 1 : 0, j >= 0 ? j : n)
	const n = argdef.length;
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
		const c = argdef.charAt(o)
		switch (c) {
			case "{": case "[":
				token = key = undefined;
				path.push(position);
				rest = false;
				position = c === "[" ? 0 : undefined;
				break
			case "}":
			case "]":
				name = argdef.substring(token, o)
				token !== undefined && args.push({ name, path: [...path, position == undefined ? key || name : position], rest })
				token = undefined;
				rest = false;
				position = path.pop();
				break
			case ":":
				key = argdef.substring(token, o)
				rest = false;
				token = undefined;
				break
			case ",":
			case ".":
			case " ":
				name = argdef.substring(token, o)
				rest = c === "." ? true : c === "," ? false : rest;
				token !== undefined && args.push({ name, path: [...path, position == undefined ? key || name : position], rest })
				token = undefined
				position = c === "," && position !== undefined ? position + 1 : position;
				break
			default:
				token = token === undefined ? o : token;
				break
		}
		o++
	}
	name = argdef.substring(token, o)
	token !== undefined && args.push({ name, path: [...path, position == undefined ? key || name : position], rest })
	return [argdef, args];
}

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

class Template {
	static All = new Map();
	constructor(input, output) {
		this.input = input;
		this.output = output;
	}
}

export const template = (declarator) => {
	// We get the paths for the arguments
	const [_, proto] = prototype(declarator)
	// We create corresponding slots
	const slots = []
	const input = proto.reduce((r, { path, name }) => {
		const s = new Slot(name);
		slots.push(s)
		return assign(r, path, s)
	}, [])
	// And we pass them to the function declarator
	return new Template(input, declarator(...input));

}

export const select = (...slots) => {
	return new Selection(slots)
}

export const component = (declarator) => {
	const t = template(declarator)
	Template.All.set(declarator, t)
	return t;

}

export const h = new Proxy(new Map(), new FactoryProxy());
export const $ = select;



export const render = (template, data, node) => {
	const c = component(template);
	console.log("C", c)
}
// EOF
