import { generate } from "astring";

export const print = (ast, options = undefined) =>
	generate(ast, {
		comments: true,
		...(options || {}),
	});

// EOF
