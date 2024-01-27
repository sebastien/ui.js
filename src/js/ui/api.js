import {
	range,
	map,
	reduce,
	filter,
	len,
	grouped,
	append,
	removeAt,
	sorted,
	cmp,
	copy,
} from "./utils/collections.js";
import { entries } from "./formats.js";
import { lerp } from "./utils/math.js";
import { setTrace } from "./utils/logging.js";

// This is mapped to `$` in formatters
export const API = {
	range,
	map,
	reduce,
	grouped,
	filter,
	sorted,
	cmp,
	entries,
	len,
	lerp,
	copy,
	append,
	removeAt,
	setTrace,
};
export default API;
