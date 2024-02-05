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
import { entries } from "./formats.js";
import { lerp } from "./utils/math.js";
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
	lerp,
	map,
	range,
	reduce,
	removeAt,
	reverse,
	setTrace,
	sorted,
};
export default API;
