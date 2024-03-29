// ## Math
export const round = (number, factor = 1, bound = 1) => {
	const base = number / factor;
	const roundedBase =
		bound < 0
			? Math.floor(base)
			: bound > 0
			? Math.ceil(base)
			: Math.round(base);
	return roundedBase * factor;
};

export const v2 = {
	dist: (va, vb) => {
		const dx = vb[0] - va[0];
		const dy = vb[1] - va[1];
		return Math.sqrt(dx * dx + dy * dy);
	},
};

export const prel = (v, a, b) => (v - a) / (b - a);
export const sign = (v) => (v >= 0 ? 1 : -1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a = 0.0, b = 1.0) => Math.min(Math.max(v, a), b);
export const minmax = (a, b) => [Math.min(a, b), Math.max(a, b)];
export const within = (v, a, b) => v >= a && v <= b;
export const range = (count) => new Array(count).fill(0).map((_, i) => i);
export const steps = (count) =>
	range(count)
		.map((_) => _ / count)
		.concat([1.0]);
// EOF
