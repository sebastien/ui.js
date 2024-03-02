import { type, isObject, isIterable } from "./values.js";
import { idem } from "./func.js";

// --
// ## Structures
//
export const asMappable = (f) => (_) => _ instanceof Array ? _.map(f) : f(_);

// NOTE: This comes largely from <https://observablehq.com/@sebastien/boilerplate>

// FIXME: this should probably expand objects to their values
export const list = (_) =>
	_ instanceof Array
		? _
		: _ instanceof Map
			? [_.values]
			: _ !== null && _ !== undefined
				? [_]
				: [];

export const reduce = (v, f, r) => {
	if (v === undefined) {
		return v;
	} else if (v instanceof Array) {
		return v.reduce(f, r);
	} else if (v instanceof Map) {
		for (const [k, w] of v.entries()) {
			const rr = f(r, w, k);
			r = rr !== undefined ? rr : r;
		}
		return r;
	} else if (typeof v === "object") {
		for (const k in v) {
			const rr = f(r, v[k], k);
			r = rr !== undefined ? rr : r;
		}
		return r;
	} else {
		return r;
	}
};

export const grouped = (collection, extractor, processor = undefined) =>
	reduce(
		collection,
		(r, v, k) => {
			const g = extractor(v, k, collection);
			(r[g] = r[g] || []).push(processor ? processor(v) : v);
			return r;
		},
		{}
	);

export const set = (collection, key, value) => {
	if (collection && collection[key] === value) {
		return collection;
	}
	if (typeof key === "number" && collection instanceof Array) {
		const res =
			collection instanceof Array ? [...collection] : { ...collection };
		while (res.length < key) {
			res.push(undefined);
		}
		res[key] = value;
		return res;
	} else {
		// TODO: Wed should maybe do a copy
		const res = collection === undefined ? {} : { ...collection };
		res[key] = value;
		return res;
	}
};

export const array = (count, creator = null) => {
	const res = new Array(count);
	while (count) {
		count--;
		res[count] = creator ? creator(count) : count;
	}
	return res;
};

export const reverse = (collection) => {
	if (collection && collection instanceof Array) {
		const n = collection.length;
		return array(n, (i) => collection[n - i - 1]);
	} else if (isObject(collection)) {
		const l = Object.keys(collection);
		const r = {};
		for (let i = l.length - 1; i >= 0; i--) {
			const k = l[i];
			r[k] = collection[k];
		}
		return r;
	} else {
		return collection;
	}
};

export const cmp = (a, b) => {
	//if (a === undefined) {
	//    return b === undefined ? 0 : -cmp(b, a);
	//}
	const ta = typeof a;
	const tb = typeof b;
	if (ta === tb) {
		switch (ta) {
			case "string":
				return a.localeCompare(b);
			case "object":
				if (a === b) {
					return 0;
				} else if (a instanceof Array) {
					const la = a.length;
					const lb = b.length;
					if (la < lb) {
						return -1;
					} else if (la > b) {
						return 1;
					} else {
						var i = 0;
						while (i < la) {
							const v = cmp(a[i], b[i]);
							if (v !== 0) {
								return v;
							}
							i += 1;
						}
						return 0;
					}
				} else {
					return -1;
				}
			default:
				return a === b ? 0 : a > b ? 1 : -1;
		}
	} else {
		return a === b ? 0 : a > b ? 1 : -1;
	}
};

export const sorted = (
	collection,
	key = undefined,
	ordering = 1,
	comparator = cmp
) => {
	const extractor =
		typeof key === "function"
			? key
			: key
				? (_) => (_ ? _[key] : undefined)
				: idem;
	const res =
		collection instanceof Array ? [].concat(collection) : list(collection);
	res.sort(
		(a, b) =>
			ordering *
			(key ? comparator(extractor(a), extractor(b)) : comparator(a, b))
	);

	return res;
};

export const map = (v, f = idem) => {
	if (v === undefined) {
		return v;
	} else if (v instanceof Array) {
		return v.map(f);
	} else if (v instanceof Map) {
		const r = new Map();
		for (const [k, w] of v.entries()) {
			r.set(k, f(w, k));
		}
		return r;
	} else if (isIterable(v)) {
		const res = [];
		let i = 0;
		for (const w of v) {
			res.push(f(w, i++));
		}
		return res;
	}
	if (isObject(v)) {
		const res = {};
		for (const k in v) {
			res[k] = f(v[k], k);
		}
		return res;
	} else {
		return f(v);
	}
};

export const entries = (value) =>
	reduce(value, (r, value, key) => (r.push({ key, value }), r), []);

export const filter = (v, f) => {
	if (v === undefined) {
		return v;
	} else if (v instanceof Array) {
		return v.filter(f);
	} else if (v instanceof Map) {
		const r = new Map();
		for (const [k, w] of v.entries()) {
			if (f(w, k)) {
				r.set(k, w);
			}
		}
		return r;
	} else if (isObject(v)) {
		const res = {};
		for (const k in v) {
			const w = v[k];
			if (f(w, k)) {
				res[k] = w;
			}
		}
		return res;
	} else {
		return f(v);
	}
};

export const each = (v, f) => {
	if (v === undefined) {
		return true;
	} else if (v instanceof Array) {
		let i = 0;
		for (const w of v) {
			if (f(w, i++) === false) {
				return false;
			}
		}
		return true;
	} else if (v instanceof Map) {
		for (const [k, w] of v.entries()) {
			if (f(w, k) === false) {
				return false;
			}
		}
		return true;
	} else if (isObject(v)) {
		for (const k in v) {
			if (f(v[k], k) === false) {
				return false;
			}
		}
		return true;
	} else if (v !== undefined) {
		return f(v) === false ? false : true;
	}
};

export function* values(v) {
	if (v instanceof Array || isIterable(v)) {
		for (const w of v) {
			yield w;
		}
	} else if (isObject(v)) {
		for (const k in v) {
			yield v[k];
		}
	} else if (v instanceof Map) {
		return v.values();
	} else if (v !== null && v !== undefined) {
		yield;
	}
}

export function* keys(v) {
	if (v instanceof Array || isObject(v)) {
		for (const i in v) {
			yield i;
		}
	} else if (v instanceof Map) {
		return v.keys();
	}
}

export function* items(v) {
	if (v instanceof Array) {
		let i = 0;
		for (const _ of v) {
			yield [i++, _];
		}
	} else if (isObject(v)) {
		for (const k of v) {
			yield [k, v[k]];
		}
	} else if (v instanceof Map) {
		for (const kv of v.entries()) {
			yield kv;
		}
	}
}

export const range = (start, end, step = 1, closed = false) => {
	if (end === undefined) {
		end = start || 0;
		start = 0;
	}
	const n = Math.ceil(Math.max(0, (end - start) / step)) + (closed ? 1 : 0);
	const r = new Array(n);
	let v = start;
	for (let i = 0; i < n; i++) {
		r[i] = v;
		v += step;
	}
	return r;
};

export const copy = (value) => {
	if (value === undefined || value === null) { return value }
	return typeof value === "object" ? map(value) : value;
}

export const append = (value, item) => {
	if (value instanceof Array) {
		return [...value, item];
	} else {
		return value;
	}
};

export const removeAt = (value, key) => {
	if (key === undefined) {
		return value;
	} else if (value === null) {
		return null;
	} else if (value instanceof Array) {
		const res = [...value];
		res.splice(key, 1);
		return res;
	} else if (value instanceof Map) {
		const res = new Map(value);
		res.clear(key);
		return res;
	} else if (typeof value === "object") {
		const res = { ...res };
		delete res[key];
		return res;
	} else {
		return value;
	}
};
export const access = (context, path, offset = 0) => {
	if (path && path.length && context !== undefined) {
		const n = path.length;
		// Note that it's a feature here to allow an offset greater than the path
		for (let i = offset; i < n; i++) {
			// TODO: We may want to deal with number vs key
			context = context[path[i]];
			if (context === undefined) {
				break;
			}
		}
	}
	return context;
};

export const len = (value) => {
	switch (type(value)) {
		case "array":
			return value.length;
		case "map":
			return value.size;
		case "object":
		case "value": {
			let n = 0;
			for (const _ in value) {
				n++;
			}
			return n;
		}
		default:
			return 0;
	}
};

// FIXME: This should be merged with `assign`, it's almost the same.
export const patch = (scope, path, value, merge = undefined, offset = 0) => {
	const n = path.length;
	// We make sure the root is an object if we need it
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof path[offset] === "number"
				? new Array(path[offset])
				: {}
			: scope;
	// Now this to make sure that path exists
	let s = root;
	for (let i = offset; i < n - 1; i++) {
		const k = path[i];
		if (!(s[k] && s[k] instanceof Object)) {
			// If s[k] is undefined, null or a non-object type, we replace it.
			s[k] = typeof k === "number" ? new Array(k) : {};
		}
		if (typeof k === "number" && s instanceof Array) {
			while (s.length < k) {
				s.push(undefined);
			}
		}
		s = s[k];
	}
	const k = path[n - 1];
	s[k] = merge ? merge(s[k], value) : value;
	return root;
};

export const assign = (scope, path, value, create = false) => {
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

export const last = (stream) => {
	let res = null;
	for (const _ of stream) {
		res = _;
	}
	return res;
};

// TOOD
// export const has = (collection, value) => {
// }
// export const add = (collection, value) => {
// }
// export const remove = (collection, value) => {
// }
export const toggle = (collection, value) => {
	if (!collection) { return [value] }
	if (collection instanceof Array) {
		const i = collection.indexOf(value);
		if (i === -1) { collection.push(value) }
		else { collection.splice(i, 1) }
		return collection;
	} else {
		return collection
	}
}



export const trigger = (handlers, ...value) => {
	let i = 0;
	for (const _ of values(handlers)) {
		i++;
		if (_(...value) === false) {
			return i;
		}
	}
	return i;
};

// EOF
