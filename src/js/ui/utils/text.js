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

	export const sprintf = (...args) => {
	var str_repeat = function (i, m) {
		for (var o = []; m > 0; o[--m] = i) {}
		return o.join("");
	};
	var i = 0,
		a,
		f = args[i++],
		o = [],
		m,
		p,
		c,
		x;
	while (f) {
		if ((m = /^[^\x25]+/.exec(f))) {
			o.push(m[0]);
		} else if ((m = /^\x25{2}/.exec(f))) {
			o.push("%");
		} else if (
			(m =
				/^\x25(?:(\d+)\$)?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(
					f
				))
		) {
			if ((a = args[m[1] || i++]) == null || a == undefined) {
				return console.error(
					"sprintf: too few arguments, expected ",
					args.length,
					"got",
					i - 1,
					"in",
					args[0]
				);
			}
			if (/[^s]/.test(m[7]) && typeof a != "number") {
				return console.error(
					"sprintf: expected number at",
					i - 1,
					"got",
					a,
					"in",
					args[0]
				);
			}
			switch (m[7]) {
				case "b":
					a = a.toString(2);
					break;
				case "c":
					a = String.fromCharCode(a);
					break;
				case "d":
					a = parseInt(a);
					break;
				case "e":
					a = m[6] ? a.toExponential(m[6]) : a.toExponential();
					break;
				case "f":
					a = m[6] ? parseFloat(a).toFixed(m[6]) : parseFloat(a);
					break;
				case "o":
					a = a.toString(8);
					break;
				case "s":
					a = (a = String(a)) && m[6] ? a.substring(0, m[6]) : a;
					break;
				case "u":
					a = Math.abs(a);
					break;
				case "x":
					a = a.toString(16);
					break;
				case "X":
					a = a.toString(16).toUpperCase();
					break;
			}
			a = /[def]/.test(m[7]) && m[2] && a > 0 ? "+" + a : a;
			c = m[3] ? (m[3] == "0" ? "0" : m[3].charAt(1)) : " ";
			x = m[5] - String(a).length;
			p = m[5] ? str_repeat(c, x) : "";
			o.push(m[4] ? a + p : p + a);
		} else {
			return console.error(
				"sprintf: reached state that shouldn't have been reached."
			);
		}
		f = f.substring(m[0].length);
	}
	return o.join("");
};

// EOF
