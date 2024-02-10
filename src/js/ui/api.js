import {
	append,
	cmp,
	copy,
	filter,
	grouped,
	len,
	map,
	range,
	reduce,
	removeAt,
	reverse,
	entries,
	sorted,
	set,
} from "./utils/collections.js";
import { type } from "./utils/values.js";
import { pipe } from "./utils/func.js";
import formats from "./formats.js";
import { lerp } from "./utils/math.js";
import query from "./utils/query.js";
import { setTrace } from "./utils/logging.js";

// This is mapped to `$` in formatters
export const API = {
	debug: () => {
		debugger;
	},
	append,
	cmp,
	type,
	copy,
	entries,
	filter,
	grouped,
	len,
	pipe,
	lerp,
	map,
	range,
	reduce,
	removeAt,
	reverse,
	setTrace,
	sorted,
	set,
	query,
	formats,
};
export default API;
