import { Context, Slot } from "./cells.js";
import { onError, onRuntimeError } from "./utils/logging.js";
import { applyAttributeValue } from "./utils/dom.js";

const RETURNED_UPDATE_SLOTS = Symbol("ui.effects.event.returnedUpdateSlots");
const BOUND_CONTEXT = Symbol.for("ui.boundContext");

const isShallowEqual = (a, b) => {
	if (Object.is(a, b)) {
		return true;
	}
	if (!a || !b || typeof a !== "object" || typeof b !== "object") {
		return false;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!Object.is(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) {
		return false;
	}
	for (const key of aKeys) {
		if (!Object.prototype.hasOwnProperty.call(b, key)) {
			return false;
		}
		if (!Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
};

export class Effect extends Slot {
	constructor(input) {
		super();
		this.input = input;
	}

	// --
	// Registers the render function to be triggered when the input
	// changes.
	subrender(node, position, context, effector) {
		const render_id = this.id + Slot.Render;
		if (!context[render_id]) {
			const rerender = () => {
				return this.render(node, position, context, effector);
			};
			context[render_id] = rerender;
			if (this.input) {
				Slot.Sub(context, this.input.id, rerender);
			}
		}
	}

	// --
	// Unregisters the render function to be triggered when the input
	// changes.
	unsubrender(context) {
		const render_id = this.id + Slot.Render;
		if (context[render_id]) {
			if (this.input) {
				Slot.Unsub(context, this.input.id, context[render_id]);
			}
			// Important: we clear the render_id so that next render
			// `subrender` is called.
			context[render_id] = undefined;
		}
	}

	render(node, position, context, effector) {
		effector.ensureContent(node, position, context[this.id]);
	}

	unrender(context, effector) {
		const c = this.input ? this.input.applyContext(context) : context;
		this.unsubrender(c);
		return c;
	}
}

export class TemplateEffect extends Effect {
	constructor(inputs, template) {
		super(inputs);
		this.template = template;
	}
	render(node, position, context, effector) {
		if (this.template instanceof Function) {
			this.template = this.template.template;
		}
		const derived = this.input.applyContext(context);
		return this.template.render(node, position, derived, effector, this.id);
	}
	unrender(context, effector) {
		const derived = super.unrender(context, effector);
		this.template.unrender(derived, effector, this.id);
	}
}

// NOTE: The component effect is very similar to the template, however we
// only dereference the `.template` at render time, as oppposed to construction
// time, which makes it possible to have recursive templates.
export class ComponentEffect extends Effect {
	constructor(input, component) {
		super(input);
		this.component = component;
		// Pre-compute the extraction slot list for fast comparison
		this._extractionSlots = null;
	}
	render(node, position, context, effector) {
		// TODO: At rendering, we need to determine if the function has been
		// converted to a component, ie. has a `template` and `applicator`.
		if (!context[this.id]) {
			// Pre-compute flat list of extraction slot ids for fast re-render
			// comparison. Observables for extraction slots are created lazily
			// by Injection.applyContext when it copies them.
			if (this.input.extraction && !this._extractionSlots) {
				const slots = [];
				Slot.Each(this.input.extraction, (slot) => {
					if (slot) slots.push(slot.id);
				});
				this._extractionSlots = slots;
			}
			// NOTE: Hopefully this is cleared
			context[this.id] = true;
		}
		const derived = this.input.applyContext(context);
		const existing = derived[this.id + Slot.Node];
		const isMounted = existing
			? existing.nodeType === Node.ATTRIBUTE_NODE
				? !!existing.ownerElement
				: !!existing.parentNode
			: false;
		// Fast path: compare extraction slot values directly from context
		// without allocating a new expanded object
		const prevValues = derived[this.id + Slot.State];
		if (isMounted && prevValues !== undefined) {
			const eslots = this._extractionSlots;
			if (eslots) {
				let changed = false;
				for (let i = 0; i < eslots.length; i++) {
					if (!Object.is(context[eslots[i]], prevValues[i])) {
						changed = true;
						break;
					}
				}
				if (!changed) {
					return existing;
				}
				// Update cached values
				for (let i = 0; i < eslots.length; i++) {
					prevValues[i] = context[eslots[i]];
				}
			} else {
				// No extraction slots, use input comparison
				const extracted = context[Slot.Input];
				if (isShallowEqual(prevValues, extracted)) {
					return existing;
				}
				derived[this.id + Slot.State] = extracted;
			}
		} else {
			// First render: cache the extraction values as a flat array
			const eslots = this._extractionSlots;
			if (eslots) {
				const values = new Array(eslots.length);
				for (let i = 0; i < eslots.length; i++) {
					values[i] = context[eslots[i]];
				}
				derived[this.id + Slot.State] = values;
			} else {
				derived[this.id + Slot.State] = this.input.extraction
					? Slot.Expand(this.input.extraction, context)
					: context[Slot.Input];
			}
		}
		// TODO: Not sure if we need to do that?
		// derived[this.id] = undefined;
		if (!this.component.isComponent) {
			onError(
				"effects.ComponentEffect",
				"Given component function has not been initialised.",
				{ component: this.component },
			);
		}
		return this.component.template.render(
			node,
			position,
			derived,
			effector,
			this.id,
		);
	}
	unrender(context, effector) {
		const derived = super.unrender(context, effector);
		this.component.template.unrender(derived, effector, this.id);
	}
}

// --
// Supports dynamic resolution of the component used to
// render.
export class DynamicComponentEffect extends Effect {
	// --
	// Takes an input (typically an Injection), derivation
	// that returns a component (function) and a factory to
	// ensure the componetn function is initialized, and
	// then resolves the component from the derivation and
	// renders it.
	constructor(input, derivation, factory) {
		super(input);
		this.derivation = derivation;
		this.factory = factory;
	}
	render(node, position, context, effector) {
		context = this.derivation.applyContext(context);
		const value = context[this.derivation.id];
		let state = context[this.id + Slot.State];

		if (
			!state ||
			!Object.is(state.value, value) ||
			!state.component ||
			!state.derived
		) {
			if (state?.component?.template?.unrender && state.derived) {
				state.component.template.unrender(state.derived, effector, this.id);
			}
			const component = this.factory(value);
			// TODO: Input is really expected to be an Injection
			this.input.args = component.input;
			// Injection caches slot matching in the parent context. Reset it when
			// switching component shape so stale mappings are not reused.
			context[this.input.id + Slot.State] = undefined;
			// Clear node cache so the newly selected template renders from
			// a fresh anchor/node layout. Effect cache is on the DOM node itself.
			const oldNode = context[this.id + Slot.Node];
			if (oldNode) {
				oldNode._uiEffects = undefined;
			}
			context[this.id + Slot.Node] = null;
			const derived = this.input.applyContext(context);
			state = context[this.id + Slot.State] = {
				value,
				component,
				derived,
			};
			context[this.id] = value;
		}

		const derived = this.input.applyContext(context);
		state.derived = derived;

		return state.component.template.render(
			node,
			position,
			derived,
			effector,
			this.id,
		);
	}
	unrender(context, effector) {
		context = this.derivation.applyContext(context);
		const state = context[this.id + Slot.State];
		if (state?.component?.template?.unrender && state.derived) {
			state.component.template.unrender(state.derived, effector, this.id);
		}
		context[this.id + Slot.State] = undefined;
		context[this.id] = undefined;
		super.unrender(context, effector);
	}
}
export class ApplicationEffect extends Effect {
	constructor(inputs, template) {
		super(inputs);
		this.template = template;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		// When we apply we create a new context detached from the previous
		// one, so that we don't leak values.
		let ctx = context[this.id];
		if (!context[this.id]) {
			ctx = {
				[Slot.Owner]: this,
				[Slot.Parent]: context,
				[Slot.Name]: "ApplicationEffect",
			};
			context[this.id] = ctx;
		}
		return this.template.render(node, position, ctx, effector, this.id);
	}
	unrender(context, effector) {
		const derived = super.unrender(context, effector);
		this.template.unrender(derived, effector, this.id);
	}
}

export class ConditionalEffect extends Effect {
	constructor(input, branches = [], elseBranch = undefined) {
		super(input);
		// TODO: Should we normalize the branches?
		this.branches = branches;
		this.elseBranch = elseBranch;
	}

	resolveBranchEffect(index) {
		return index < this.branches.length
			? this.branches[index][2]
			: this.elseBranch;
	}

	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.subrender(node, position, context, effector);
		const value = context[this.input.id];
		// State is [previousBranchIndex, branchNode, branchInitialized0, branchInitialized1, ...]
		// We store branch node directly in state[1] instead of in a child context,
		// avoiding Object.create() for each branch.
		let state = context[this.id + Slot.State];
		if (!state) {
			context[this.id + Slot.State] = state = [undefined, undefined];
		}
		let i = 0;
		let match = undefined;
		const branches = this.branches;
		for (let j = 0; j < branches.length; j++) {
			const branch = branches[j];
			const type = branch[0];
			const condition = branch[1];
			if (type === 3) {
				// Function
				if (condition(value)) {
					match = branch[2];
				}
			} else if (type === 2) {
				// Array of values
				for (const v of condition) {
					if (v == value) {
						match = branch[2];
						break;
					}
				}
			} else {
				if (condition == value) {
					match = branch[2];
				}
			}
			if (match !== undefined) {
				break;
			} else {
				i++;
			}
		}
		if (match === undefined) {
			match = this.elseBranch;
		}
		let mountNode = node;
		let mountPosition = position;
		if (i != state[0]) {
			// We need to unmount the previous state
			if (state[0] !== undefined) {
				const previousNode = state[1];
				if (previousNode?.parentNode) {
					const parent = previousNode.parentNode;
					let index = 0;
					while (
						index < parent.childNodes.length &&
						parent.childNodes[index] !== previousNode
					) {
						index += 1;
					}
					if (index < parent.childNodes.length) {
						mountNode = parent;
						mountPosition = index;
					}
				}
				const previousEffect = this.resolveBranchEffect(state[0]);
				if (previousEffect?.unrender) {
					previousEffect.unrender(context, effector, this.id);
				} else if (state[1]) {
					effector.unmount(state[1]);
				}
			}
			state[0] = i;
			// Clear the node cache so the new branch gets a
			// fresh render instead of reusing the old branch's node.
			// Effect cache is stored on the DOM node itself.
			const oldNode = context[this.id + Slot.Node];
			if (oldNode) {
				oldNode._uiEffects = undefined;
			}
			context[this.id + Slot.Node] = null;
		}
		// Render the branch directly into the parent context.
		// Branch effects have globally unique IDs, so no collision.
		if (match === undefined) {
			return (state[1] = undefined);
		}
		if (typeof match.render === "function") {
			return (state[1] = match.render(
				mountNode,
				mountPosition,
				context,
				effector,
				this.id,
			));
		}
		return (state[1] = effector.ensureContent(mountNode, mountPosition, match));
	}

	unrender(context, effector) {
		const state = context[this.id + Slot.State];
		if (state && state[0] !== undefined) {
			const activeEffect = this.resolveBranchEffect(state[0]);
			if (activeEffect?.unrender) {
				activeEffect.unrender(context, effector, this.id);
			} else if (state[1]) {
				effector.unmount(state[1]);
			}
		}
		// Clear stale state and node cache so that when re-rendered
		// (e.g. after an outer conditional round-trip) the conditional
		// starts fresh instead of reusing detached DOM references.
		context[this.id + Slot.State] = undefined;
		context[this.id + Slot.Node] = undefined;
		super.unrender(context, effector);
	}
}

function* keys(value) {
	if (value instanceof Array) {
		for (let i = 0; i < value.length; i++) {
			yield i;
		}
	} else {
		for (const k in value) {
			yield k;
		}
	}
}
export class MappingEffect extends Effect {
	constructor(input, factory, valueSlot, keySlot, keyBy = undefined) {
		super(input);
		// TODO: template is going to be a function that should take `(value,key)`
		// where Value and Key will be slots as part of this mapping
		this.valueSlot = valueSlot;
		this.keySlot = keySlot;
		this.keyBy = keyBy;
		this.template = factory(valueSlot, keySlot);
	}

	resolveKey(value, index) {
		if (typeof this.keyBy === "function") {
			return this.keyBy(value, index);
		}
		if (
			value &&
			typeof value === "object" &&
			Object.prototype.hasOwnProperty.call(value, "id")
		) {
			return value.id;
		}
		return undefined;
	}

	normalizeKey(key) {
		if (key === undefined || key === null) {
			return null;
		}
		const t = typeof key;
		if (t !== "string" && t !== "number") {
			return null;
		}
		return `u:${t}:${key}`;
	}

	_clearArrayState(state, effector, templateId) {
		if (!state) {
			return;
		}
		if (state instanceof Array) {
			for (let i = 0; i < state.length; i += 2) {
				if (state[i]) {
					this.template.unrender(state[i], effector, templateId);
				}
			}
			state.length = 0;
			return;
		}
		if (state instanceof Map) {
			for (const [, ctx] of state.entries()) {
				this.template.unrender(ctx, effector, templateId);
			}
			state.clear();
			return;
		}
		if (state.mapping instanceof Map) {
			for (const [, ctx] of state.mapping.entries()) {
				this.template.unrender(ctx, effector, templateId);
			}
			state.mapping.clear();
			if (state.order instanceof Array) {
				state.order.length = 0;
			}
		}
	}

	_renderArrayIndexed(items, node, itemPos, context, effector, templateId) {
		let entries = context[this.id + Slot.State];
		if (!entries || entries instanceof Map || entries.mapping) {
			this._clearArrayState(entries, effector, templateId);
			entries = context[this.id + Slot.State] = [];
		}
		const prevCount = entries.length >> 1;
		const n = items.length;

		for (let k = 0; k < n; k++) {
			const base = k << 1;
			const value = items[k];
			let ctx = entries[base];

			if (!ctx) {
				ctx = Object.create(context);
				ctx[Slot.Parent] = context;
				ctx[Slot.Owner] = this;
				ctx[Slot.Name] = "MappingEffect";
				ctx[this.id + Slot.State] = null;
				ctx[this.valueSlot.id] = value;
				ctx[this.keySlot.id] = k;
				entries[base] = ctx;
				entries[base + 1] = value;
			} else {
				const existing = ctx[templateId + Slot.Node];
				if (existing && Object.is(entries[base + 1], value)) {
					continue;
				}
				this.valueSlot.set(value, true, ctx);
				this.keySlot.set(k, true, ctx);
				entries[base + 1] = value;
			}
			itemPos[1] = k;
			this.template.render(node, itemPos, ctx, effector, templateId);
		}

		if (prevCount > n) {
			for (let k = n; k < prevCount; k++) {
				const base = k << 1;
				if (entries[base]) {
					this.template.unrender(entries[base], effector, templateId);
				}
			}
			entries.length = n << 1;
		}
	}

	_renderArrayKeyed(items, node, itemPos, context, effector, templateId) {
		let state = context[this.id + Slot.State];
		if (!state || !state.mapping || !state.order) {
			this._clearArrayState(state, effector, templateId);
			state = context[this.id + Slot.State] = {
				mapping: new Map(),
				order: [],
			};
		}
		const mapping = state.mapping;
		const previousOrder = state.order;
		const nextOrder = [];
		const seen = new Set();
		const warnedDuplicates = new Set();

		for (let i = 0; i < items.length; i++) {
			const value = items[i];
			let token = this.normalizeKey(this.resolveKey(value, i));
			if (!token) {
				token = `i:${i}`;
			}
			if (seen.has(token)) {
				if (!warnedDuplicates.has(token)) {
					warnedDuplicates.add(token);
					console.warn("[uijs] Duplicate map key in MappingEffect", {
						key: token,
						index: i,
					});
				}
				token = `i:${i}`;
			}
			seen.add(token);
			nextOrder.push(token);

			let ctx = mapping.get(token);
			if (!ctx) {
				ctx = Object.create(context);
				ctx[Slot.Parent] = context;
				ctx[Slot.Owner] = this;
				ctx[Slot.Name] = "MappingEffect";
				ctx[this.id + Slot.State] = null;
				ctx[this.valueSlot.id] = value;
				ctx[this.keySlot.id] = i;
				mapping.set(token, ctx);
			} else {
				const existing = ctx[templateId + Slot.Node];
				if (!(existing && Object.is(ctx[this.valueSlot.id], value))) {
					this.valueSlot.set(value, true, ctx);
					ctx[this.valueSlot.id] = value;
				}
				if (!Object.is(ctx[this.keySlot.id], i)) {
					this.keySlot.set(i, true, ctx);
					ctx[this.keySlot.id] = i;
				}
			}

			itemPos[1] = i;
			this.template.render(node, itemPos, ctx, effector, templateId);
		}

		for (let i = 0; i < previousOrder.length; i++) {
			const token = previousOrder[i];
			if (!seen.has(token)) {
				const ctx = mapping.get(token);
				if (ctx) {
					this.template.unrender(ctx, effector, templateId);
					mapping.delete(token);
				}
			}
		}

		state.order = nextOrder;
	}

	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.subrender(node, position, context, effector);
		// We retrieve the mapped items, which are bound to this cell id.
		const items = context[this.input.id];
		// Cache template id for inner loop
		const templateId = this.template.id ?? this.id;
		// Reusable position array to avoid allocating [position, i] per item
		const itemPos = [position, 0];

		if (items instanceof Array) {
			const firstAutoKey =
				items.length > 0 ? this.resolveKey(items[0], 0) : undefined;
			const shouldUseKeyed =
				typeof this.keyBy === "function" ||
				(firstAutoKey !== undefined && firstAutoKey !== null);
			if (shouldUseKeyed) {
				this._renderArrayKeyed(
					items,
					node,
					itemPos,
					context,
					effector,
					templateId,
				);
			} else {
				this._renderArrayIndexed(
					items,
					node,
					itemPos,
					context,
					effector,
					templateId,
				);
			}
		} else {
			// Object/Map inputs: use Map with revision-based cleanup.
			// We retrieve the corresponding mapping state, typically `undefined`
			// on the first run.
			let mapping = context[this.id + Slot.State];
			// We retrieve the revision number, which we set to `1` at first.
			const revision = (context[this.id + Slot.Revision] =
				(context[this.id + Slot.Revision] || 0) + 1);
			// If there's no mapping defined, we create a new `Map`, which will
			// be used to hold the state.
			if (!mapping || !(mapping instanceof Map)) {
				context[this.id + Slot.State] = mapping = new Map();
			}
			// Now we iterate over the keys for each item.
			let i = 0;
			if (items) {
				for (const k in items) {
					i = this._renderItem(
						k,
						items[k],
						node,
						itemPos,
						i,
						context,
						effector,
						mapping,
						revision,
						templateId,
					);
				}
			}
			// Remove mapping items that haven't been updated
			if (mapping.size > i) {
				const to_remove = [];
				for (const [k, ctx] of mapping.entries()) {
					if (ctx[this.id + Slot.Revision] !== revision) {
						to_remove.push(k);
					}
				}
				for (let j = 0; j < to_remove.length; j++) {
					const k = to_remove[j];
					this.template.unrender(mapping.get(k), effector, templateId);
					mapping.delete(k);
				}
			}
		}
	}

	_renderItem(
		k,
		value,
		node,
		itemPos,
		i,
		context,
		effector,
		mapping,
		revision,
		templateId,
	) {
		// Map stores ctx directly (no sub-array). Revision is tracked at
		// ctx[this.id + Slot.Revision] and previous value is read from
		// ctx[this.valueSlot.id].
		let ctx = mapping.get(k);
		// If there's no context, then we have a new key.
		if (!ctx) {
			// We start by creating a derived context, so that derivations
			// won't affect the parent context.
			ctx = Object.create(context);
			ctx[Slot.Parent] = context;
			ctx[Slot.Owner] = this;
			ctx[Slot.Name] = "MappingEffect";
			// We make sure that we can recurse this effect by nullifying
			// the current node reference.
			ctx[this.id + Slot.State] = null;
			// Track the revision for stale entry detection.
			ctx[this.id + Slot.Revision] = revision;
			// Direct assignment on first render since no observables exist yet.
			ctx[this.valueSlot.id] = value;
			ctx[this.keySlot.id] = k;
			// We register the context in the mapping.
			mapping.set(k, ctx);
		} else {
			// Update the revision so this entry is not cleaned up as stale.
			ctx[this.id + Slot.Revision] = revision;
			const existing = ctx[templateId + Slot.Node];
			// Short-circuit: skip slot assignment and re-render if value
			// hasn't changed and we already have a rendered node.
			if (existing && Object.is(ctx[this.valueSlot.id], value)) {
				return i + 1;
			}
			this.valueSlot.set(value, true, ctx);
			this.keySlot.set(k, true, ctx);
		}
		// Reuse the position array, just update the index
		itemPos[1] = i;
		this.template.render(node, itemPos, ctx, effector, templateId);
		return i + 1;
	}
	unrender(context, effector) {
		context = this.input.applyContext(context);
		const state = context[this.id + Slot.State];
		const templateId = this.template.id ?? this.id;
		if (state) {
			if (state instanceof Map) {
				// Map stores ctx directly (no sub-array wrapper)
				for (const [k, ctx] of state.entries()) {
					this.template.unrender(ctx, effector, templateId);
				}
				state.clear();
			} else if (state.mapping instanceof Map) {
				for (const [, ctx] of state.mapping.entries()) {
					this.template.unrender(ctx, effector, templateId);
				}
				state.mapping.clear();
				state.order.length = 0;
			} else {
				// Flat array: [ctx0, val0, ctx1, val1, ...]
				for (let i = 0; i < state.length; i += 2) {
					if (state[i]) {
						this.template.unrender(state[i], effector, templateId);
					}
				}
				state.length = 0;
			}
		}
		this.unsubrender(context);
	}
}

export class FormattingEffect extends Effect {
	constructor(input, format, placeholder = null) {
		super(input);
		this.format = format;
		this.placeholder = placeholder;
		this.placeholderNodeType = Node.TEXT_NODE;
	}
	render(node, position, context, effector) {
		// TODO: If input is undefined, we'll need to determine the inputs
		// dynamically.
		context = this.input ? this.input.applyContext(context) : context;
		// TODO: We need to know when we need to unrender/clear
		this.subrender(node, position, context, effector);
		const input = context[this.input?.id];
		const previous = context[this.id + Slot.State];
		const textNode = context[this.id + Slot.Node];
		// We make sure to guard a re-render, and only proceed if there'sure
		// a data change.
		if (input !== previous || textNode === undefined) {
			const output = this._format(input, node);
			context[this.id + Slot.State] = input;
			if (!textNode) {
				if (node?.nodeType === Node.TEXT_NODE) {
					node.data = output;
					return (context[this.id + Slot.Node] = node);
				}
				return (context[this.id + Slot.Node] = effector.ensureText(
					node,
					position,
					output,
				));
			} else {
				textNode.data = output;
				return textNode;
			}
		} else {
			return textNode;
		}
	}

	_format(input, node) {
		if (!this.format) {
			return `${input}`;
		}
		try {
			return this.format.args ? this.format(...input) : this.format(input);
		} catch (error) {
			onRuntimeError(error, this.format.toString(), {
				node: node,
				input: this.format?.args ? [input] : input,
			});
			return undefined;
		}
	}

	unrender(context, effector) {
		const c = super.unrender(context, effector);
		// Clear cached text node and previous value so re-rendering
		// after a conditional round-trip creates a fresh text node
		// instead of returning a detached one.
		c[this.id + Slot.Node] = undefined;
		c[this.id + Slot.State] = undefined;
	}
}

export class AttributeEffect extends Effect {
	constructor(input, format) {
		super(input);
		this.format = format;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.subrender(node, position, context, effector);
		const input = context[this.input.id];
		const output = this.format ? this.format(input) : input;
		context[this.id + Slot.State] = applyAttributeValue(
			node,
			node.namespaceURI,
			node.name,
			output,
			context[this.id + Slot.State],
		);
		return node;
	}
}

export class RefEffect extends Effect {
	constructor(ref) {
		super(undefined);
		this.ref = ref;
	}

	resolveRef(context) {
		let ref = this.ref;
		if (ref instanceof Slot) {
			const resolved = context ? context[ref.id] : undefined;
			if (resolved !== undefined) {
				ref = resolved;
			}
		}
		return ref;
	}

	assign(ref, context, value) {
		if (ref instanceof Slot) {
			ref.set(value, true, context);
		} else if (typeof ref === "function") {
			Context.Run(context, ref, [value]);
		}
	}

	render(node, position, context, effector) {
		const stateId = this.id + Slot.State;
		const target = node?.ownerElement ?? context[this.id + Slot.Node];
		if (!target) {
			return node;
		}
		context[this.id + Slot.Node] = target;
		const state = context[stateId];
		if (state?.target !== target) {
			if (state?.ref) {
				this.assign(state.ref, state.context ?? context, null);
			}
			const ref = this.resolveRef(context);
			context[stateId] = { target, ref, context };
			this.assign(ref, context, target);
			if (node?.ownerElement) {
				target.removeAttributeNode(node);
			}
		}
		return node ?? target;
	}

	unrender(context, effector) {
		const state = context[this.id + Slot.State];
		if (state?.ref) {
			this.assign(state.ref, state.context ?? context, null);
		} else {
			this.assign(this.resolveRef(context), context, null);
		}
		context[this.id + Slot.State] = undefined;
		context[this.id + Slot.Node] = undefined;
		super.unrender(context, effector);
	}
}

export class EventHandlerEffect extends Effect {
	// --
	// Ensures that the given `handler` function has a corresponding effect.
	static Ensure(handler, name) {
		return name === "onmount" || name === "onunmount"
			? new LifecycleEventHandlerEffect(handler, name)
			: new EventHandlerEffect(handler, name);
	}
	constructor(handler, event) {
		super(handler instanceof Slot ? handler : undefined);
		this.handler = handler;
		this.event = event;
		this.wrapper = (event, ...rest) => {
			const context = Context.Get();
			const callback = this.resolveHandler(context);
			const res =
				typeof callback === "function" ? callback(event, ...rest) : undefined;
			if (res && Object.getPrototypeOf(res) === Object.prototype) {
				const updateContext =
					typeof callback === "function" && callback[BOUND_CONTEXT]
						? callback[BOUND_CONTEXT]
						: context;
				this.applyReturnedUpdates(updateContext, res);
			}
			// TODO: We should do post-processing.
			return res;
		};
		// NOTE: This is a first pass at SSR with incremental loading
		// of components.
		// const uijs = (globalThis.uijs = globalThis.uijs || {});
		// uijs[`H${this.id}`] = this.wrapper;
	}

	resolveHandler(context) {
		if (this.handler instanceof Slot) {
			if (!context) {
				return undefined;
			}
			return context[this.handler.id];
		}
		return this.handler;
	}

	collectNamedSlots(context) {
		const owner = context?.[Slot.Owner];
		if (!owner || !owner.args) {
			return null;
		}
		if (!owner[RETURNED_UPDATE_SLOTS]) {
			const slots = Object.create(null);
			Slot.Each(owner.args, (slot) => {
				if (slot?.name) {
					slots[slot.name] = slot;
				}
			});
			owner[RETURNED_UPDATE_SLOTS] = slots;
		}
		return owner[RETURNED_UPDATE_SLOTS];
	}

	applyReturnedUpdates(context, updates) {
		if (!context) {
			return;
		}
		const keys = Object.keys(updates);
		if (!keys.length) {
			return;
		}
		const slots = this.collectNamedSlots(context);
		if (!slots) {
			return;
		}
		Slot.Batch(context, () => {
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const slot = slots[key];
				if (slot) {
					Slot.Notify(context, slot.id, updates[key], true);
				}
			}
		});
	}

	render(node, position, context, effector) {
		this.input?.applyContext(context);
		const stateId = this.id + Slot.State;
		const eventName = this.event.startsWith("on")
			? this.event.substring(2)
			: this.event;
		const target = node?.ownerElement ?? context[this.id + Slot.Node];
		if (target) {
			context[this.id + Slot.Node] = target;
		}
		if (
			!Object.prototype.hasOwnProperty.call(context, stateId) ||
			context[stateId] === undefined
		) {
			if (!target) {
				return node;
			}
			const state = (context[stateId] = {
				context: context,
				target,
				eventName,
				wrapper: (...args) => {
					Context.Run(context, this.wrapper, args);
				},
			});
			// TODO: Should include the context id in the wrapper
			target.addEventListener(eventName, state.wrapper);
			if (node?.ownerElement) {
				target.removeAttributeNode(node);
			}
		}
		// context = this.input.applyContext(context);
		// const input = context[this.input.id];
		// const output = this.format ? this.format(input) : input;
		// // TODO: If it's a style, we should merge it as an object
		// node.value = output;
		return node ?? target;
	}

	unrender(context, effector) {
		const state = context[this.id + Slot.State];
		if (state?.target && state?.wrapper) {
			state.target.removeEventListener(state.eventName, state.wrapper);
		}
		context[this.id + Slot.State] = undefined;
		super.unrender(context, effector);
	}

	toString() {
		return `globalThis.uijs?.H${this.id}(...arguments)`;
	}
}

export class LifecycleEventHandlerEffect extends EventHandlerEffect {
	render(node, position, context, effector) {
		this.input?.applyContext(context);
		const stateId = this.id + Slot.State;
		const target = node?.ownerElement ?? context[this.id + Slot.Node];
		if (target) {
			context[this.id + Slot.Node] = target;
		}
		if (
			!Object.prototype.hasOwnProperty.call(context, stateId) ||
			context[stateId] === undefined
		) {
			if (!target) {
				return node;
			}
			if (node?.ownerElement) {
				target.removeAttributeNode(node);
			}
			context[stateId] = true;
		}
		if (!context[this.id]) {
			context[this.id] = (context[this.id] ?? 0) + 1;
			if (this.event === "onmount") {
				Context.Run(context, this.wrapper, [node]);
			}
		}
		return node ?? target;
	}
	unrender(context, effector, id) {
		const previous = context[this.id] ?? 0;
		if (previous <= 0) {
			return;
		}
		context[this.id] = previous - 1;
		if (previous === 1 && this.event === "onunmount") {
			Context.Run(context, this.wrapper, [context[this.id + Slot.Node]]);
		}
		super.unrender(context, effector, id);
	}
}

export class ContextBoundEffect extends Effect {
	constructor(renderable, boundContext) {
		super(undefined);
		this.renderable = renderable;
		this.boundContext = boundContext;
	}
	render(node, position, context, effector) {
		return this.renderable.render(
			node,
			position,
			this.boundContext,
			effector,
			this.id,
		);
	}
	unrender(context, effector) {
		if (this.renderable.unrender) {
			this.renderable.unrender(this.boundContext, effector, this.id);
		}
		super.unrender(context, effector);
	}
}
// EOF
