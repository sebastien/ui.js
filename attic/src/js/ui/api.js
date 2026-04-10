import {
	array,
	append,
	cmp,
	copy,
	filter,
	flatten,
	grouped,
	len,
	map,
	range,
	reduce,
	removeAt,
	reverse,
	entries,
	occurrences,
	unique,
	sorted,
	toggle,
	values,
	set,
} from "./utils/collections.js";
import { type, bool, symbols } from "./utils/values.js";
import { pipe } from "./utils/func.js";
import formats from "./formats.js";
import { lerp, prel } from "./utils/math.js";
import query from "./utils/query.js";
import { setTrace } from "./utils/logging.js";
import { drag } from "./interaction.js";
import { repeat } from "./utils/async.js";
import { getJSON, getText } from "./utils/http.js";
import data from "./utils/data.js";

// This is mapped to `$` in formatters
export const API = {
	and: (...args) => {
		for (const _ of args) {
			if (!bool(_)) {
				return false;
			}
		}
		return true;
	},
	data,
	bool,
	array,
	debug: () => {
		debugger;
	},
	append,
	cmp,
	type,
	copy,
	entries,
	values,
	flatten,
	filter,
	grouped,
	len,
	pipe,
	lerp,
	prel,
	map,
	occurrences,
	range,
	reduce,
	removeAt,
	reverse,
	setTrace,
	sorted,
	set,
	repeat,
	toggle,
	query,
	formats,
	drag,
	symbols,
	getJSON,
	getText,
	unique,
};
export default API;
