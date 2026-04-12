const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const camelToKebab = (value) =>
	value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const isPlainObject = (value) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

const toClassTokens = (value) => {
	if (value === null || value === undefined) {
		return [];
	}
	if (Array.isArray(value)) {
		const tokens = [];
		for (let i = 0; i < value.length; i++) {
			const entry = value[i];
			if (entry === null || entry === undefined) {
				continue;
			}
			const parts = `${entry}`.trim().split(/\s+/);
			for (let j = 0; j < parts.length; j++) {
				if (parts[j]) {
					tokens.push(parts[j]);
				}
			}
		}
		return tokens;
	}
	return `${value}`.trim().split(/\s+/).filter(Boolean);
};

const setRawAttribute = (target, ns, name, value) => {
	const text = `${value}`;
	if (target?.nodeType === Node.ATTRIBUTE_NODE) {
		target.value = text;
		return;
	}
	if (!target) {
		return;
	}
	if (ns) {
		target.setAttributeNS(ns, name, text);
	} else {
		target.setAttribute(name, text);
	}
};

const setStyleProperty = (style, key, value) => {
	if (!style) {
		return;
	}
	if (
		typeof style.setProperty === "function" &&
		(key.startsWith("--") || key.includes("-"))
	) {
		style.setProperty(key, `${value}`);
	} else {
		style[key] = `${value}`;
	}
};

const clearStyleProperty = (style, key) => {
	if (!style) {
		return;
	}
	if (
		typeof style.removeProperty === "function" &&
		(key.startsWith("--") || key.includes("-"))
	) {
		style.removeProperty(key);
	} else {
		style[key] = "";
	}
};

const serializeStyleObject = (value) => {
	const parts = [];
	for (const key in value) {
		if (!hasOwn(value, key)) {
			continue;
		}
		const styleValue = value[key];
		if (
			styleValue === null ||
			styleValue === undefined ||
			styleValue === false
		) {
			continue;
		}
		const name =
			key.startsWith("--") || key.includes("-") ? key : camelToKebab(key);
		parts.push(`${name}:${styleValue}`);
	}
	return parts.join(";");
};

export const applyAttributeValue = (
	target,
	ns,
	name,
	value,
	state = undefined,
) => {
	if (ns) {
		setRawAttribute(target, ns, name, value);
		return state;
	}

	const element =
		target?.nodeType === Node.ATTRIBUTE_NODE ? target.ownerElement : target;
	if (!element) {
		setRawAttribute(target, ns, name, value);
		return state;
	}

	if (name === "value") {
		const tagName = element.nodeName?.toLowerCase?.();
		if (tagName === "input" || tagName === "textarea") {
			element.value = `${value}`;
		}
	}

	if (name === "class") {
		if (Array.isArray(value)) {
			const tokens = toClassTokens(value);
			for (let i = 0; i < tokens.length; i++) {
				element.classList.add(tokens[i]);
			}
			if (target?.nodeType === Node.ATTRIBUTE_NODE) {
				target.value = element.getAttribute("class") || "";
			}
			return state;
		}
		if (isPlainObject(value)) {
			for (const className in value) {
				if (!hasOwn(value, className)) {
					continue;
				}
				const mode = value[className];
				if (mode === null) {
					element.classList.toggle(className);
				} else if (mode === true) {
					element.classList.add(className);
				} else if (mode === false) {
					element.classList.remove(className);
				}
			}
			if (target?.nodeType === Node.ATTRIBUTE_NODE) {
				target.value = element.getAttribute("class") || "";
			}
			return state;
		}
	}

	if (name === "style" && isPlainObject(value)) {
		const previousStyleKeys = state?.styleKeys;
		const nextStyleKeys = new Set();
		for (const key in value) {
			if (!hasOwn(value, key)) {
				continue;
			}
			nextStyleKeys.add(key);
			const styleValue = value[key];
			if (
				styleValue === null ||
				styleValue === undefined ||
				styleValue === false
			) {
				clearStyleProperty(element.style, key);
			} else {
				setStyleProperty(element.style, key, styleValue);
			}
		}
		if (previousStyleKeys) {
			for (const key of previousStyleKeys) {
				if (!nextStyleKeys.has(key)) {
					clearStyleProperty(element.style, key);
				}
			}
		}
		if (target?.nodeType === Node.ATTRIBUTE_NODE) {
			target.value = element.getAttribute("style") || "";
		}
		const serialized = serializeStyleObject(value);
		if (serialized) {
			setRawAttribute(element, undefined, "style", serialized);
		} else {
			element.removeAttribute?.("style");
		}
		return { ...(state || {}), styleKeys: nextStyleKeys };
	}

	if (name === "style" && state?.styleKeys) {
		for (const key of state.styleKeys) {
			clearStyleProperty(element.style, key);
		}
	}

	setRawAttribute(target, ns, name, value);
	return name === "style" ? undefined : state;
};
