// Project: LittleUI
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: utils/clsx
// Class-name composition helpers inspired by `clsx`, implemented with an
// iterator-based pipeline. Falsy values are skipped, arrays are flattened, and
// object keys are emitted when their values are truthy.

// ----------------------------------------------------------------------------
//
// CLASSNAME COMPOSITION
//
// ----------------------------------------------------------------------------

// Function: iclsx
// Yields normalized class-name fragments from `args`.
function* iclsx(...args) {
	for (const v of args) {
		if (!v) {
			continue;
		}
		switch (v?.constructor) {
			case Array:
				yield* iclsx(...v);
				break;
			case Object:
				for (const k in v) {
					const w = k.trim();
					if (v[k] && w) {
						yield w;
					}
				}
				break;
			case String:
				{
					const w = v.trim();
					if (w.length) {
						yield w;
					}
				}
				break;
			case Number:
				yield `${v}`;
				break;
			case Boolean:
				break;
		}
	}
}

// Function: clsx
// Joins the class-name fragments produced from `args` into a single string.
function clsx(...args) {
	return [...iclsx(...args)].join(" ");
}

export { clsx, iclsx };
export default clsx;
// EOF
