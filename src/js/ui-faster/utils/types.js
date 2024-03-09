export const RawObjectPrototype = Object.getPrototypeOf({});
export const isObject = (value) =>
	value && Object.getPrototypeOf(value) === RawObjectPrototype ? true : false;
