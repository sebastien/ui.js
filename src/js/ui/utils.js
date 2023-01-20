// --
//  ## Utilities

export const onError = (message, context) => {
	console.error(message, context);
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

export const makeKey = () =>
	numcode(new Date().getTime() * 100000 + Math.random() * 100000);
export const nextKey = (value) => {
	if (value instanceof Array) {
		value.push(undefined);
		return value.length - 1;
	} else {
		while (true) {
			const k = makeKey();
			if (value[k] === undefined) {
				return k;
			}
		}
	}
};

// EOF
