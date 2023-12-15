export const strip = (text, prefix = " ", suffix = prefix) => {
	if (!text) {
		return text;
	}
	const i = text.startsWith(prefix) ? prefix.length : undefined;
	const j = text.endsWith(suffix) ? text.length - prefix.length : undefined;
	return i || j ? text.substring(i || 0, j) : text;
};
export const numfmt = (value, precision = 0) => {
	const p = Math.pow(10, precision);
	const v = parseFloat(value);
	const w = Math.round(v * p);
	const k = `${w}`;
	const i = k.length - precision;
	return precision && v * p != w
		? `${k.substring(0, i) || "0"}.${k.substring(i) || "0"}`
		: value;
};

export const numcode = (
	number,
	alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
) => {
	const res = [];
	const n = alphabet.length;
	let v = number;
	while (v > 0) {
		const r = v % n;
		v = Math.floor(v / n);
		res.unshift(alphabet.charAt(r));
	}
	return res.join("");
};

// EOF
