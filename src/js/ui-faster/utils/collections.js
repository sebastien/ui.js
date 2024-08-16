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

export const grouped = (collection, extractor, processor = undefined) => {
	const ext =
		typeof extractor === "string" ? (_) => _ && _[extractor] : extractor;
	return reduce(
		collection,
		(r, v, k) => {
			const g = ext(v, k, collection);
			(r[g] = r[g] || []).push(processor ? processor(v) : v);
			return r;
		},
		{},
	);
};
