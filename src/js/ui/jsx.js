import { h, Fragment } from "./hyperscript.js";

const childrenToArgs = (children) =>
	children instanceof Array ? children : [children];

const splitProps = (props) => {
	if (!props) {
		return [{}, undefined, undefined];
	}
	const { children, key, ...attributes } = props;
	return [attributes, children, key];
};

export { Fragment };

export const jsx = (type, props, key) => {
	const [attributes, children, propKey] = splitProps(props);
	const resolvedKey = key ?? propKey;
	if (resolvedKey !== undefined) {
		attributes.key = resolvedKey;
	}
	return children === undefined
		? h(type, attributes)
		: h(type, attributes, ...childrenToArgs(children));
};

export const jsxs = jsx;
export const jsxDEV = jsx;
