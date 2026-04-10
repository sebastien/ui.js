// TODO: This needs to support assignment within the signature, eg: `{panels, selection = "POUET"}`

// --
// Retrieves the arguments from a JavaScript function declaration by parsing
// the arguments, and supporting decomposition.
export const getSignature = (func) => {
	// We extract the args
	const t = func.toString();
	const i = t.indexOf("(");
	let j = t.indexOf(")");
	j = j < 0 ? t.indexOf("=>") : j;
	const declaration = t.slice(i >= 0 ? i + 1 : 0, j >= 0 ? j : t.length);
	const n = declaration.length;
	// Now we do the parsing
	const args = [];
	// Path is the access path from the parent structure.
	const path = [];
	// That's the offset
	let o = 0;
	let position = 0;
	let token = 0;
	let rest = false;
	let name = undefined;
	let key = undefined;
	// This is essentially a parser of a subset of JavaScript values.
	while (o < n) {
		const c = declaration.charAt(o);
		switch (c) {
			case "{":
			case "[":
				path.push(position ?? key);
				rest = false;
				position = c === "[" ? 0 : undefined;
				token = key = undefined;
				break;
			case "}":
			case "]":
				name = declaration.substring(token, o);
				token !== undefined &&
					args.push({
						name,
						path: [
							...path,
							position == undefined ? key || name : position,
						],
						rest,
					});
				token = undefined;
				rest = false;
				position = path.pop();
				break;
			case ":":
				key = declaration.substring(token, o);
				rest = false;
				token = undefined;
				break;
			case ",":
			case ".":
			case " ":
				name = declaration.substring(token, o);
				rest = c === "." ? true : c === "," ? false : rest;
				token !== undefined &&
					args.push({
						name,
						path: [
							...path,
							position == undefined ? key || name : position,
						],
						rest,
					});
				token = undefined;
				position =
					c === "," && position !== undefined
						? position + 1
						: position;
				break;
			default:
				token = token === undefined ? o : token;
				break;
		}
		o++;
	}
	name = declaration.substring(token, o);
	token !== undefined &&
		args.push({
			name,
			path: [...path, position == undefined ? key || name : position],
			rest,
		});
	// TODO: We should also return the body
	return { declaration, args };
};
// EOF
