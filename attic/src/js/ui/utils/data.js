import { map, each, reduce, assign, values, keys } from "./collections.js";
import { Skip, isObject, Enum } from "./values.js";
import { capitalize } from "./text.js";

export class Type {
	static Get(value) {
		const t = typeof value;
		if (value === null) {
			return Types.Nil;
		} else if (value === undefined) {
			return Type.Empty;
		} else if (t === "string") {
			return Types.String;
		} else if (t === "number") {
			return Types.Number;
		} else if (value instanceof Array) {
			return Types.Collection;
		} else if (isObject(value)) {
			return Types.Structure;
		} else {
			return Types.Unknown;
		}
	}
	constructor(name) {
		this.name = name;
	}
}
export const Types = Enum(
	"Unknown",
	"Nil",
	"Empty",
	"String",
	"Number",
	"Collection",
	"Structure",
);

export class Sampler {
	constructor() {
		this.values = new Map();
	}
	get type() {
		const t = [...this.values.keys()];
		return t.length > 1 ? t : t[0];
	}
	sample(value, type) {
		const k = type || Type.Get(value);

		if (!this.values.has(k)) {
			this.values.set(k, new Map());
		}
		const m = this.values.get(k);
		m.set(value, (m.get(value) || 0) + 1);
		return value;
	}
}

export function* inspect(value, path = []) {
	const type = Type.Get(value);
	switch (type) {
		case Types.Nil:
		case Types.Empty:
		case Types.String:
		case Types.Number:
			yield { path, value, type };
			break;
		case Types.Collection:
			{
				yield { path, value, type };
				const p = path ? [...path, "*"] : ["*"];
				for (const v of value) {
					for (const _ of inspect(v, p)) {
						yield _;
					}
				}
			}
			break;
		case Types.Structure:
			yield { path, value, type };
			for (const k in value) {
				for (const _ of inspect(value[k], path ? [...path, k] : [k])) {
					yield _;
				}
			}
	}
}

export const schema = (data) => {
	const samplers = new Map();
	for (const { path, value, type } of inspect(data)) {
		if (!samplers.has(path)) {
			samplers.set(path, new Sampler());
		}
		samplers.get(path).sample(value, type);
	}
	const res = {};
	const structures = {};
	for (const [path, sampler] of samplers.entries()) {
		const type = sampler.type;
		const definition = { type };
		assign(
			res,
			path.reduce((r, v) => {
				r.push("children");
				r.push(v);
				return r;
			}, []),
			definition,
		);
		if (type === Types.Structure) {
			const name = path
				.filter((_) => _ !== "*")
				.map((_, i) => (i === 0 ? _ : capitalize(_)))
				.join("");
			structures[name] = { name, path: path.join("."), definition };
		}
	}
	return { structures, schema: res };
};

export const types = (series) => {
	let nulls = 0;
	let strings = 0;
	let numbers = 0;
	let values = 0;
	each(series, (_) => {
		const t = typeof _;
		if (_ === null || _ === undefined) {
			nulls++;
		} else if (t === "string") {
			strings++;
		} else if (t === "number") {
			numbers++;
		} else {
			values++;
		}
	});
	return { nulls, strings, numbers, values };
};

export const categories = (series, normalizer = null) =>
	reduce(series, (r, v) => {
		const k = normalizer ? normalizer(v) : v;
		if (k !== Skip) {
			r.set(k, r.get(k) || 0);
		}
		return r;
	});

export const describe = (series, key = undefined) => {
	if (series && key && typeof key === "string") {
		return describe(
			reduce(series, (r, v) => (r.push(v ? v[key] : undefined), r), []),
		);
	}
	const seed = {
		min: undefined,
		max: undefined,
		total: 0,
		count: 0,
		mean: 0,
		variance: 0,
		deviation: 0,
		values: series,
	};
	const res =
		reduce(
			series,
			(r, v) => {
				r.min = Math.min(r.min === undefined ? v : r.min, v);
				r.max = Math.max(r.max === undefined ? v : r.min, v);
				r.total += v;
				r.count += 1;

				return r;
			},
			seed,
		) || seed;
	res.mean = res.total / res.count;
	// FROM: https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
	// We do a two pass-algorithm as it's safer
	const m = res.mean;
	res.variance =
		reduce(
			series,
			(r, v) => {
				const dm = v - m;
				return r + dm * dm;
			},
			0,
		) / res.count;
	res.deviation = Math.sqrt(res.variance);
	return res;
};

export function* tabled(data, headers = true) {
	const cols = [];
	if (headers) {
		yield cols;
	}
	for (const row of values(data)) {
		for (const col of keys(row)) {
			let i = cols.indexOf(col);
			if (i === -1) {
				i = cols.length;
				cols.push(col);
			}
		}
		yield cols.map((_) => row[_]);
	}
}

export const table = (data, headers) => [...tabled(data, headers)];
//
// TODO: May want to move that somewhere else

export function* queried(data, path, offset = 0) {
	path = typeof path === "string" ? path.split(".") : path;
	const k = path[offset];
	if (offset == path.length - 1) {
		yield data;
	} else if (k === "*") {
		for (const v of values(data)) {
			for (const w of queried(v, path, offset + 1)) {
				yield w;
			}
		}
	} else {
		for (const w of queried(data[k], path, offset + 1)) {
			yield w;
		}
	}
}

export const query = (data, path) => [...queried(data, path)];

export default {
	table,
	query,
	schema,
	describe,
};
