import { URLHash } from "./url.js";
import { onError } from "./utils.js";

// FIXME: Should be rounting
const parseRoute = (text) => {
	const m = text.match(/^((?<scheme>[a-z]+):)?(?<path>.+)$/);
	return m
		? { scheme: m.groups.scheme || "state", path: m.groups.path }
		: null;
};

class Binding {
	on(path, handler) {}
	put(path, value) {}
}

export class URLHashBinding extends Binding {
	constructor(hash) {
		super();
		this.hash = hash;
		this.state = {};
		this.handlers = new Map();
		this.hash.onChange((...args) => this.onChange(...args));
	}

	on(path, handler) {
		if (!this.handlers.has(path)) {
			this.handlers.set(path, []);
		}
		const handlers = this.handlers.get(path);
		handlers.push(handler);
		return () => handlers.remove(handler);
	}

	put(path, value) {
		if (this.state[path] !== value) {
			this.hash.set(path, value);
		}
	}

	onChange(data) {
		for (const [key, handlers] of this.handlers.entries()) {
			const v = data[key];
			if (v !== this.state[key]) {
				for (const h of handlers) {
					h(v);
				}
				this.state[key] = v;
			}
		}
	}
}

export class StateBinding extends Binding {
	constructor(state) {
		super();
		this.state = state;
	}
	on(path, handler) {
		this.state.sub(path, handler);
		return () => this.state.unsub(path, handler);
	}
	put(path, value) {
		this.state.put(path, value);
	}
}

export const Bindings = {};

export const bind = (routes, bindings = Bindings) => {
	const unbind = [];
	for (const k in routes) {
		const src = parseRoute(k);
		const dst = parseRoute(routes[k]);
		if (!bindings[dst.scheme]) {
			onError(`Binding ${dst.scheme} not defined`, { bindings });
		}
		if (!bindings[src.scheme]) {
			onError(`Binding ${src.scheme} not defined`, { bindings });
		}
		const push = (_) => bindings[dst.scheme].put(dst.path, _);
		const pull = (_) => bindings[src.scheme].put(src.path, _);
		unbind.push(bindings[src.scheme].on(src.path, push));
		unbind.push(bindings[dst.scheme].on(dst.path, pull));
	}
	return () => unbind.forEach((_) => _());
};
