import { Parser } from "acorn";
import jsx from "acorn-jsx";

const JSXParser = Parser.extend(jsx());

export const parse = (source, options = undefined) => {
	const opts = options || {};
	return JSXParser.parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		allowHashBang: true,
		locations: true,
		ranges: true,
		...opts,
	});
};

// EOF
