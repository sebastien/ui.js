export const def = (...rest) => {
	for (const v of rest) {
		if (v !== undefined) {
			return v;
		}
	}
};

export const extractor = (key) =>
	typeof key === "function"
		? key
		: key
			? (_) => (_ ? _[key] : undefined)
			: idem;

export const pipe = (v, ...f) => {
	let r = v;
	for (let i = 0; i < f.length; i++) {
		r = f[i](r);
	}
	return r;
};

export const idem = (_) => _;

const Memoized = new Map();
export const memo = (guards, functor) => {
	const scope = (guards instanceof Array ? guards : [guards]).reduce(
		(r, v) => {
			if (r.has(v)) {
				return r.get(v);
			} else {
				const w = new Map();
				r.set(v, w);
				return w;
			}
		},
		Memoized,
	);
	if (!scope.has(true)) {
		scope.set(true, functor());
	}
	return scope.get(true);
};

// EOF
