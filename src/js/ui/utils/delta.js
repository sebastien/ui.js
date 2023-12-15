import { type } from "./values.js";
import { map, each } from "./collections.js";

export const diffstate = (
	valueA,
	valueB,
	onCreate,
	onUpdate,
	onRemove,
	state
) => {
	// All hanlders are (CURRENT,INDEX,PREVIOUS,STATE)
	// We discrimated between atoms and composites (objects)
	const ta =
		valueA === null || valueA === undefined ? undefined : typeof valueA;
	const tb =
		valueB === null || valueB === undefined ? undefined : typeof valueB;
	// Value A did not exist, so we're creating Value B
	if (ta === undefined) {
		if (tb === undefined) {
			return null;
		} else if (tb === "number" || tb === "string") {
			return onCreate(valueB, null, null, state);
		} else {
			return map(valueB, (v, k) =>
				onCreate(v, k, null, state ? state[k] : undefined)
			);
		}
	}
	// Value B does not exist, so Value A is removed.
	else if (tb === undefined) {
		if (tb === undefined) {
			return null;
		} else if (ta === "number" || ta === "string") {
			onRemove(valueA, null, valueA, state);
			return null;
		} else {
			each(valueB, (v, k) =>
				onRemove(null, k, v, state ? state[k] : undefined)
			);
			return null;
		}
	}
	// We're transforming from atom to list or from list to atom
	else if (ta !== tb) {
		// From ATOM to LIST
		if (tb === "object") {
			onRemove(null, null, valueA, state);
			return map(valueB, (v, k) => onCreate(v, k, null, state));
			// From LIST to ATOM
		} else {
			return onCreate(
				valueB,
				null,
				valueA,
				map(valueA, (v, k) =>
					onRemove(null, k, v, state ? state[k] : undefined)
				)
			);
		}
	}
	// We have an atom
	else if (ta !== "object") {
		return valueA === valueB
			? state
			: onUpdate(valueB, null, valueA, state);
	}
	// We have the same iterable type, so we can go on!
	else {
		const res = map(valueB, (v, k) => {
			const valueA_k = valueA[k];
			const state_k = state ? state[k] : undefined;
			return valueA_k === undefined
				? onCreate(v, k, valueA_k, state_k)
				: valueA_k === v
				? state_k
				: onUpdate(v, k, valueA_k, state_k);
		});
		// We remove the items from A (previous) that are not defined in B.
		// NOTE: onRemove may still return a value, so even though the key
		// was unmapped in B, there may still be a state key
		each(valueA, (v, k) => {
			const state_k =
				valueB[k] === undefined
					? onRemove(valueB[k], k, v, state ? state[k] : undefined)
					: undefined;
			// NOTE: A may be a dict and B a list, in which case we'll be
			// inserting properties in the resulting state.
			if (state_k !== undefined) {
				res[k] = state_k;
			}
		});
		return res;
	}
};

export const cmp = (a, b) => {
	//if (a === undefined) {
	//    return b === undefined ? 0 : -cmp(b, a);
	//}
	const ta = typeof a;
	const tb = typeof b;
	if (ta === tb) {
		switch (ta) {
			case "string":
				return a.localeCompare(b);
			case "object":
				if (a === b) {
					return 0;
				} else if (a instanceof Array) {
					const la = a.length;
					const lb = b.length;
					if (la < lb) {
						return -1;
					} else if (la > b) {
						return 1;
					} else {
						var i = 0;
						while (i < la) {
							const v = cmp(a[i], b[i]);
							if (v !== 0) {
								return v;
							}
							i += 1;
						}
						return 0;
					}
				} else {
					return -1;
				}
			default:
				return a === b ? 0 : a > b ? 1 : -1;
		}
	} else {
		return a === b ? 0 : a > b ? 1 : -1;
	}
};

export const eq = (a, b) => {
	if (a === b) {
		return true;
	}
	const ta = type(a);
	const tb = type(b);

	if (ta === tb) {
		switch (ta) {
			case "string":
				return a == b;
			case "array": {
				const la = a.length;
				const lb = b.length;
				if (la !== lb) {
					return false;
				} else {
					var i = 0;
					while (i < la) {
						if (!eq(a[i], b[i])) {
							return false;
						}
						i += 1;
					}
					return true;
				}
			}
			case "object":
			case "map":
				// TODO: We might want to do that with keys
				return a === b;
			default:
				return a == b;
		}
	} else {
		return a == b;
	}
};
