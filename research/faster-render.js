
class Context {

	onNode(ns, name, ...args) {
		console.log("Args", { ns, name, args })
	}
}


class FactoryProxy {
	constructor(namespace) {
		this.namespace = namespace;
	}
	get(scope, property) {
		return (...args) => scope.onNode(this.namespace, property, ...args)
	}
}

class Selectable {
	get entries() {
		return this;
	}

	if(...branches) {
		return this;
	}

	match(cases) {
		return this;
	}


	map(transform) {
		console.log("MAP", transform)
		define(transform)
		return this;
	}

	fmt(text) {
		return this
	}
}

class Slot extends Selectable {
	static Count = 0;
	constructor(name, index = null) {
		super();
		this.id = Slot.Count++;
		this.name = name;
		this.index = index;
		this.children = undefined;
	}
}

class Selection extends Selectable { }


class SlotDeclarationProxy {
	static get(slot, property) {
		if (!slot.children) { slot.children = new Map() }
		const m = slot.children;
		if (m.has(property)) { return m.get(property) }
		else {
			const c = new Slot(property);
			m.set(property, c)
			return c;
		}
	}
}

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

export const define = (declarator) => {
	// We get the paths for the arguments
	const [def, proto] = prototype(declarator)
	// We create corresponding slots
	const slots = proto.reduce((r, { path, name }) => assign(r, path, new Slot(name)), [])
	// And we pass them to the function declarator
	declarator(...slots);
	return slots;

}

const idem = _ => _;
export const select = (...slots) => {
	return new Selection(slots)
}

export const component = (declarator) => {
	define(declarator)
}

export const globalContext = new Context();
export const h = new Proxy(globalContext, new FactoryProxy());
export const $ = select;



export const render = (template, data, node, context = globalContext) => {
	component(template)
}
// EOF
