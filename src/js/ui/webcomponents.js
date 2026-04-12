import { Slot } from "./cells.js";
import { DOMEffector } from "./effectors.js";
import { component } from "./templates.js";

const Disconnect = Symbol.for("Disconnect");
const Adopted = Symbol.for("Adopted");
const BaseHTMLElement = globalThis.HTMLElement || class {};

const toKebabCase = (value) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();

const toCamelCase = (value) =>
	value
		.toLowerCase()
		.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());

const parseAttributeValue = (value) => {
	if (value === null) {
		return null;
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	if (value !== "" && !Number.isNaN(Number(value))) {
		return Number(value);
	}
	return value;
};

const isPlainObject = (value) =>
	value !== null && Object.getPrototypeOf(value) === Object.prototype;

const collectInputSlots = (shape, slots = new Map()) => {
	if (!shape) {
		return slots;
	}
	if (shape instanceof Slot) {
		if (shape.name) {
			slots.set(shape.name, shape);
		}
		return slots;
	}
	if (Array.isArray(shape)) {
		for (let i = 0; i < shape.length; i++) {
			collectInputSlots(shape[i], slots);
		}
		return slots;
	}
	if (shape instanceof Map) {
		for (const value of shape.values()) {
			collectInputSlots(value, slots);
		}
		return slots;
	}
	if (isPlainObject(shape)) {
		for (const key in shape) {
			collectInputSlots(shape[key], slots);
		}
	}
	return slots;
};

const createAttributeBindings = (slotsByName) => {
	const bindings = new Map();
	for (const [name, slot] of slotsByName.entries()) {
		bindings.set(name, slot);
		bindings.set(name.toLowerCase(), slot);
		bindings.set(toKebabCase(name), slot);
	}
	return bindings;
};

const collectObservedAttributes = (slotsByName) => {
	const attributes = new Set();
	for (const name of slotsByName.keys()) {
		attributes.add(name.toLowerCase());
		attributes.add(toKebabCase(name));
	}
	return Array.from(attributes);
};

class UIWebComponent extends BaseHTMLElement {
	constructor(componentFactory, initial = {}, attributeBindings = new Map()) {
		super();
		this.root =
			typeof this.attachShadow === "function"
				? this.attachShadow({ mode: "open" })
				: null;
		this.component = component(componentFactory);
		this.initial = { ...initial };
		this.attributeBindings = attributeBindings;
		this.context = null;
		this.effector = new DOMEffector();
		this.isInitialised = false;
		this.slots = {};
		this._onSlotChange = (event) => this.onSlotChange(event);
	}

	readAttributes() {
		const data = {};
		for (const attribute of this.attributes) {
			const key = this.attributeBindings.has(attribute.name)
				? this.attributeBindings.get(attribute.name).name
				: toCamelCase(attribute.name);
			data[key] = parseAttributeValue(attribute.value);
		}
		return data;
	}

	applyData(data) {
		if (!this.context) {
			Object.assign(this.initial, data);
			return;
		}
		const input =
			this.context[Slot.Input] && typeof this.context[Slot.Input] === "object"
				? this.context[Slot.Input]
				: (this.context[Slot.Input] = {});
		Slot.Batch(this.context, () => {
			for (const key in data) {
				const value = data[key];
				input[key] = value;
				const slot =
					this.attributeBindings.get(key) ||
					this.attributeBindings.get(key.toLowerCase()) ||
					this.attributeBindings.get(toKebabCase(key));
				if (slot) {
					Slot.Notify(this.context, slot.id, value, true);
				}
			}
		});
	}

	setupSlotListeners() {
		if (!this.root) {
			return;
		}
		for (const key in this.slots) {
			this.slots[key].removeEventListener("slotchange", this._onSlotChange);
		}
		this.slots = {};
		const slotElements = this.root.querySelectorAll("slot");
		for (const slot of slotElements) {
			const name = slot.getAttribute("name") || "children";
			this.slots[name] = slot;
			slot.addEventListener("slotchange", this._onSlotChange);
		}
	}

	onSlotChange(event) {
		const slot = event.target;
		if (!(slot instanceof HTMLSlotElement)) {
			return;
		}
		const name = slot.getAttribute("name") || "children";
		const hasContent = slot.assignedNodes({ flatten: true }).length > 0;
		this.applyData({ [name]: hasContent });
	}

	initializeUI() {
		if (this.context || !this.root) {
			return;
		}
		const data = { ...this.initial, ...this.readAttributes() };
		this.context = [];
		this.context[Slot.Owner] = this.component.template;
		this.context[Slot.Parent] = null;
		this.context[Slot.Name] = `webcomponent:${this.localName}`;
		this.context[Slot.Input] = { ...data };
		const matches = Slot.Match(this.component.input, data, this.context);
		for (let i = 0; i < matches.length; i += 2) {
			const slot = matches[i];
			const value = matches[i + 1];
			this.context[slot.id] = value;
		}
		this.component.template.render(this.root, 0, this.context, this.effector);
		this.setupSlotListeners();
	}

	connectedCallback() {
		if (!this.context) {
			this.initializeUI();
		}
		if (!this.isInitialised) {
			this.isInitialised = true;
		}
	}

	disconnectedCallback() {
		this.trigger(Disconnect);
		for (const key in this.slots) {
			this.slots[key].removeEventListener("slotchange", this._onSlotChange);
		}
		if (this.context) {
			this.component.template.unrender(this.context, this.effector);
			this.context = null;
			this.root?.replaceChildren();
		}
	}

	adoptedCallback() {
		this.trigger(Adopted);
	}

	attributeChangedCallback(name, _previous, current) {
		const slot =
			this.attributeBindings.get(name) ||
			this.attributeBindings.get(name.toLowerCase()) ||
			this.attributeBindings.get(toCamelCase(name));
		const key = slot ? slot.name : toCamelCase(name);
		this.applyData({ [key]: parseAttributeValue(current) });
	}

	trigger(name, previous, current) {
		switch (name) {
			case Disconnect:
			case Adopted:
				break;
			default:
				console.warn("TODO: webcomponent.trigger", {
					name,
					previous,
					current,
				});
		}
	}
}

function webcomponent(name, componentFactory, initial = undefined) {
	const win = globalThis.window;
	if (!win?.customElements) {
		return null;
	}
	if (win.customElements.get(name)) {
		return null;
	}
	const compiledComponent = component(componentFactory);
	const slotsByName = collectInputSlots(compiledComponent.input);
	const observedAttributes = collectObservedAttributes(slotsByName);
	const attributeBindings = createAttributeBindings(slotsByName);
	const WebComponent = class extends UIWebComponent {
		static observedAttributes = observedAttributes;
		constructor() {
			super(compiledComponent, initial ?? {}, attributeBindings);
		}
	};
	win.customElements.define(name, WebComponent);
	return WebComponent;
}

export { Adopted, Disconnect, UIWebComponent, webcomponent };
export default webcomponent;

// EOF
