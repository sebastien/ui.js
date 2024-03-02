
const func = [
	// () => null,
	//(a, { b, c }) => null,
	// ({ a }) => null,
	// ({ a, b }) => null,
	// ({ a, b }, [c, d]) => null,
	// ([a]) => null,
	// ([a, b]) => null,
	// ([a, b, c]) => null,
	// ([...d]) => null,
	// ([a, b, c, ...d]) => null,
	(a, [b, [c, d, { e, key: f }], { g, h, i, x: j }, ...x]) => null,
]

const args = (func) => {
	const t = func.toString();
	const i = t.indexOf("(");
	const j = t.indexOf(")");
	const argdef = t.slice(i + 1, j)
	const n = argdef.length;
	const args = [];
	const parents = [];
	const path = [];
	let o = 0;
	let position = 0;
	let token = 0;
	let rest = false;
	let name = undefined;
	let key = undefined;
	let pc = undefined;
	while (o < n) {
		const c = argdef.charAt(o)
		switch (c) {
			case "{": case "[":
				parents.push(c);
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
				parents.pop();
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
	token !== undefined && args.push({ name, path: [...path, position == undefined ? key || name : position], rest })
	return { argdef, args };
}
console.log(args(func[0]))
