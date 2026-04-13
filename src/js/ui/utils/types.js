export const RawObjectPrototype = Object.getPrototypeOf({});
export const isObject = (value) =>
	!!(value && Object.getPrototypeOf(value) === RawObjectPrototype);

export const isPromiseLike = (value) =>
	!!value &&
	(typeof value === "object" || typeof value === "function") &&
	typeof value.then === "function";
