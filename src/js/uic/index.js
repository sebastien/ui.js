import { parse } from "./parser.js";
import { transform } from "./transform.js";
import { print } from "./generator.js";

export const compile = (source, options = undefined) => {
	const ast = parse(source, options?.parser);
	const transformed = transform(ast, options?.transform);
	const code = print(transformed, options?.generator);
	return {
		code,
		ast: transformed,
	};
};

// EOF
