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
	sorted,
} from "./utils/collections.js";
import { pipe } from "./utils/func.js";
import { entries } from "./formats.js";
import { lerp } from "./utils/math.js";
import query from "./utils/query.js";
import { setTrace } from "./utils/logging.js";

// This is mapped to `$` in formatters
export const API = {
	append,
	cmp,
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
	query,
};
export default API;
