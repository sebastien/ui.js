// --
//  # Utilities

export const Empty = Symbol("Empty");
export const Any = Symbol("Any");
export const Stop = Symbol("Stop");
export const RawObjectPrototype = Object.getPrototypeOf({});

("");

// FIXME: Should be isNothing
export const isEmpty = (value) =>
	value === null || value === undefined || value === Empty;
export const isAtom = (value) =>
	isEmpty(value) ||
	typeof value !== "object" ||
	(Object.getPrototypeOf(value) !== RawObjectPrototype &&
		!(value instanceof Array));

export const bool = (value) =>
	value === null ||
	value === undefined ||
	value === false ||
	value === "" ||
	(value instanceof Array && value.length === 0) ||
	(isObject(value) && Object.getOwnPropertyNames().length === 0)
		? false
		: value
		? true
		: false;

export const isObject = (value) =>
	value && Object.getPrototypeOf(value) === RawObjectPrototype ? true : false;
export const type = (_) => {
	const t = typeof _;
	switch (_) {
		case null:
			return "null";
		case undefined:
			return "undefined";
		default:
			switch (t) {
				case "number":
				case "string":
				case "boolean":
				case "function":
					return t;
				default:
					return _ instanceof Array
						? "array"
						: _ instanceof Map
						? "map"
						: Object.getPrototypeOf(_) === RawObjectPrototype
						? "object"
						: "value";
			}
	}
};

export const Enum = (...values) =>
	Object.freeze(
		values.reduce((r, v) => {
			r[`${v}`] = typeof v === "string" ? Symbol(v) : v;
			return r;
		}, {})
	);

// EOF
