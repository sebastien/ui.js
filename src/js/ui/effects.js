import { Context, Slot } from "./cells.js";
import { applyAttributeValue } from "./utils/dom.js";
import { onError, onRuntimeError } from "./utils/logging.js";
import { isPromiseLike } from "./utils/types.js";

const RETURNED_UPDATE_SLOTS = Symbol("ui.effects.event.returnedUpdateSlots");
const BOUND_CONTEXT = Symbol.for("ui.boundContext");
const CURRENT_EVENT_TARGET = Symbol.for("ui.currentEventTarget");
const TEMPLATE_KEY = Symbol.for("ui.templateKey");
const EFFECT_CLEANUPS = Symbol.for("ui.effect.cleanups");

// TODO: Should be moved to utils/collections
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
		if (!Object.hasOwn(b, key)) {
			return false;
		}
		if (!Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
};

// TODO: Should have documentation explaining the concept.
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

	unrender(context, _effector) {
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
		const cleanups = derived[EFFECT_CLEANUPS];
		if (Array.isArray(cleanups)) {
			// `$.effect(...)` registrations are scoped to this derived component
			// context. On unmount we must both unsubscribe and run any pending
			// disposer to avoid leaking listeners or side effects.
			for (let i = 0; i < cleanups.length; i++) {
				const entry = cleanups[i];
				if (!entry) {
					continue;
				}
				if (entry.selectionId !== undefined && entry.listener) {
					Slot.Unsub(derived, entry.selectionId, entry.listener);
				}
				entry.dispose?.();
			}
			derived[EFFECT_CLEANUPS] = undefined;
		}
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
			if (globalThis.__DEBUG_NOTIFY)
				console.log(
					`  ComponentEffect: mounted, checking eslots=${eslots?.length}`,
				);
			if (eslots) {
				let changed = false;
				for (let i = 0; i < eslots.length; i++) {
					if (!Object.is(context[eslots[i]], prevValues[i])) {
						changed = true;
						break;
					}
				}
				if (!changed) {
					if (globalThis.__DEBUG_NOTIFY) {
						console.log(
							`  ComponentEffect: no change in extraction, returning existing`,
						);
						for (let i = 0; i < eslots.length; i++) {
							console.log(
								`    slot[${i}] id=${eslots[i]} ctx=${context[eslots[i]]} prev=${prevValues[i]} same=${Object.is(context[eslots[i]], prevValues[i])}`,
							);
						}
					}
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
		if (globalThis.__DEBUG_NOTIFY)
			console.log(
				`  ComponentEffect: re-rendering template, component=${this.component?.name}`,
			);
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
		context[this.id + Slot.State] = undefined;
		context[this.id + Slot.Node] = undefined;
		context[this.id] = undefined;
		if (this.input) {
			context[this.input.id] = undefined;
			context[this.input.id + Slot.State] = undefined;
		}
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
		let match;
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
					if (v === value) {
						match = branch[2];
						break;
					}
				}
			} else {
				if (condition === value) {
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
		if (i !== state[0]) {
			// We need to unmount the previous state
			if (state[0] !== undefined) {
				const previousNode = state[1];
				const resolveMountTarget = (branchNode) => {
					if (!branchNode) {
						return null;
					}
					if (branchNode.parentNode) {
						return {
							parent: branchNode.parentNode,
							anchor: branchNode,
						};
					}
					if (
						branchNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
						Array.isArray(branchNode._uiFragmentChildren)
					) {
						for (const child of branchNode._uiFragmentChildren) {
							if (child?.parentNode) {
								return {
									parent: child.parentNode,
									anchor: child,
								};
							}
						}
					}
					return null;
				};
				const mountTarget = resolveMountTarget(previousNode);
				if (mountTarget) {
					const { parent, anchor } = mountTarget;
					let index = 0;
					while (
						index < parent.childNodes.length &&
						parent.childNodes[index] !== anchor
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

export class MappingEffect extends Effect {
	constructor(input, factory, valueSlot, keySlot, keyBy = undefined) {
		super(input);
		// TODO: template is going to be a function that should take `(value,key)`
		// where Value and Key will be slots as part of this mapping
		this.valueSlot = valueSlot;
		this.keySlot = keySlot;
		this.keyBy = keyBy;
		this.rendersOnIndexChange =
			typeof factory === "function" && factory.length > 1;
		this.template = factory(valueSlot, keySlot);
		this.templateKey = this.template?.[TEMPLATE_KEY];
	}

	resolveTemplateKey(value, index, context) {
		const keyTemplate = this.templateKey;
		if (keyTemplate === undefined || keyTemplate === null) {
			return undefined;
		}
		if (keyTemplate === this.valueSlot) {
			return value;
		}
		if (keyTemplate === this.keySlot) {
			return index;
		}
		if (
			keyTemplate &&
			typeof keyTemplate.transform === "function" &&
			keyTemplate.input
		) {
			const inputValue =
				keyTemplate.input === this.valueSlot
					? value
					: keyTemplate.input === this.keySlot
						? index
						: context?.[keyTemplate.input.id];
			try {
				return keyTemplate.isMultipleArguments
					? keyTemplate.transform(...inputValue)
					: keyTemplate.transform(inputValue);
			} catch (_error) {
				return undefined;
			}
		}
		if (keyTemplate instanceof Slot) {
			return context?.[keyTemplate.id];
		}
		return keyTemplate;
	}

	resolveKey(value, index, context) {
		if (typeof this.keyBy === "function") {
			return this.keyBy(value, index);
		}
		const templateKey = this.resolveTemplateKey(value, index, context);
		if (templateKey !== undefined && templateKey !== null) {
			return templateKey;
		}
		if (value && typeof value === "object" && Object.hasOwn(value, "id")) {
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

	// --
	// Fast path for clearing all mapped items when the input becomes
	// empty.  Instead of letting each per-item `template.unrender()`
	// call `removeChild` individually (N DOM mutations), we first
	// bulk-detach every mapped DOM node in a single pass, then walk
	// the item contexts for subscription / lifecycle cleanup.  Because
	// the nodes are already parentless at that point the DOM-removal
	// code inside `VNode.unrender` becomes a no-op.
	_fastClear(node, context, effector, templateId) {
		const state = context[this.id + Slot.State];
		if (!state) {
			return;
		}

		// -- 1. Collect every item DOM node so we can detach in bulk ----
		const nodeSlotId = templateId + Slot.Node;
		const altNodeSlotId = this.id + Slot.Node;
		const itemNodes = [];

		if (Array.isArray(state)) {
			// Flat indexed array: [ctx0, val0, ctx1, val1, …]
			for (let i = 0; i < state.length; i += 2) {
				const ctx = state[i];
				if (ctx) {
					const n = ctx[nodeSlotId] ?? ctx[altNodeSlotId];
					if (n) itemNodes.push(n);
				}
			}
		} else if (state.production instanceof Map) {
			for (const ctx of state.production.values()) {
				const n = ctx[nodeSlotId] ?? ctx[altNodeSlotId];
				if (n) itemNodes.push(n);
			}
		}

		// -- 2. Bulk DOM detach -----------------------------------------
		for (let i = 0; i < itemNodes.length; i++) {
			const n = itemNodes[i];
			if (n.parentNode) {
				n.parentNode.removeChild(n);
			} else if (n._uiFragmentChildren) {
				// DocumentFragment: children were moved into the DOM.
				for (const child of n._uiFragmentChildren) {
					if (child.parentNode) {
						child.parentNode.removeChild(child);
					}
				}
				n._uiFragmentMounted = false;
			}
		}

		// -- 3. Context / subscription cleanup (DOM removal is now a no-op)
		this._clearState(state, effector, templateId);

		// -- 4. Reset mapping state -------------------------------------
		context[this.id + Slot.State] = undefined;
	}

	// --
	// Clears any mapping state shape, unrendering all item contexts.
	// Handles both flat array (indexed path) and {production, order}
	// (keyed/object path).
	_clearState(state, effector, templateId) {
		if (!state) {
			return;
		}
		if (Array.isArray(state)) {
			// Flat array: [ctx0, val0, ctx1, val1, ...]
			for (let i = 0; i < state.length; i += 2) {
				if (state[i]) {
					this.template.unrender(state[i], effector, templateId);
				}
			}
			state.length = 0;
			return;
		}
		if (state.production instanceof Map) {
			for (const [, ctx] of state.production.entries()) {
				this.template.unrender(ctx, effector, templateId);
			}
			state.production.clear();
			if (state.order) {
				state.order.length = 0;
			}
		}
	}

	// --
	// Computes the Longest Increasing Subsequence of `arr`.
	// Returns a Set of indices whose elements are part of the LIS
	// (i.e. nodes that do NOT need to be moved).
	// Uses the standard O(n log n) patience-sorting algorithm.
	_computeLIS(arr) {
		const n = arr.length;
		if (n === 0) {
			return new Set();
		}
		// tails[i] holds the smallest tail value for increasing
		// subsequences of length i+1.
		const tails = new Array(n);
		// indices[i] holds the index in arr corresponding to tails[i].
		const indices = new Array(n);
		// prev[i] holds the predecessor index for reconstructing the LIS.
		const prev = new Array(n);
		let length = 0;

		for (let i = 0; i < n; i++) {
			const v = arr[i];
			if (v < 0) {
				// New items (no previous position) — always moved.
				continue;
			}
			// Binary search for the leftmost tail >= v.
			let lo = 0;
			let hi = length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (tails[mid] < v) {
					lo = mid + 1;
				} else {
					hi = mid;
				}
			}
			tails[lo] = v;
			indices[lo] = i;
			prev[i] = lo > 0 ? indices[lo - 1] : -1;
			if (lo === length) {
				length++;
			}
		}

		// Reconstruct the LIS indices.
		const result = new Set();
		let k = indices[length - 1];
		for (let i = length - 1; i >= 0; i--) {
			result.add(k);
			k = prev[k];
		}
		return result;
	}

	// --
	// Reorders DOM nodes to match `nextOrder`, using LIS to
	// minimise the number of DOM mutations.
	_reorderDOM(node, production, nextOrder, prevOrder, templateId) {
		if (!node?.childNodes || nextOrder.length === 0) {
			return;
		}

		if (node.nodeType === Node.COMMENT_NODE && node.parentNode) {
			// Anchor-comment mode: items sit before the anchor.
			const parent = node.parentNode;

			if (prevOrder.length === 0) {
				// First render: just insert all items before the anchor.
				for (let i = 0; i < nextOrder.length; i++) {
					const ctx = production.get(nextOrder[i]);
					const itemNode = ctx?.[templateId + Slot.Node];
					if (itemNode && itemNode.parentNode !== parent) {
						parent.insertBefore(itemNode, node);
					}
				}
				return;
			}

			// Fast path: if order hasn't changed, skip entirely.
			if (prevOrder.length === nextOrder.length) {
				let same = true;
				for (let i = 0; i < prevOrder.length; i++) {
					if (prevOrder[i] !== nextOrder[i]) {
						same = false;
						break;
					}
				}
				if (same) {
					return;
				}
			}

			// Build old-position lookup and compute LIS.
			const oldPos = new Map();
			for (let i = 0; i < prevOrder.length; i++) {
				oldPos.set(prevOrder[i], i);
			}
			const positions = new Array(nextOrder.length);
			for (let i = 0; i < nextOrder.length; i++) {
				const p = oldPos.get(nextOrder[i]);
				positions[i] = p !== undefined ? p : -1;
			}
			const stable = this._computeLIS(positions);

			// Process in reverse so that each insertBefore places the
			// node just before `cursor`, building the order bottom-up.
			let cursor = node;
			for (let i = nextOrder.length - 1; i >= 0; i--) {
				const ctx = production.get(nextOrder[i]);
				const itemNode = ctx?.[templateId + Slot.Node];
				if (!itemNode) {
					continue;
				}
				if (!stable.has(i)) {
					parent.insertBefore(itemNode, cursor);
				}
				cursor = itemNode;
			}
		} else {
			// Regular parent mode: children should match nextOrder.

			if (prevOrder.length === 0) {
				// First render: append items not yet in the parent.
				for (let i = 0; i < nextOrder.length; i++) {
					const ctx = production.get(nextOrder[i]);
					const itemNode = ctx?.[templateId + Slot.Node];
					if (itemNode && !itemNode.parentNode) {
						node.appendChild(itemNode);
					}
				}
				return;
			}

			// Fast path: if order hasn't changed, skip entirely.
			if (prevOrder.length === nextOrder.length) {
				let same = true;
				for (let i = 0; i < prevOrder.length; i++) {
					if (prevOrder[i] !== nextOrder[i]) {
						same = false;
						break;
					}
				}
				if (same) {
					return;
				}
			}

			// Build old-position lookup and compute LIS.
			const oldPos = new Map();
			for (let i = 0; i < prevOrder.length; i++) {
				oldPos.set(prevOrder[i], i);
			}
			const positions = new Array(nextOrder.length);
			for (let i = 0; i < nextOrder.length; i++) {
				const p = oldPos.get(nextOrder[i]);
				positions[i] = p !== undefined ? p : -1;
			}
			const stable = this._computeLIS(positions);

			for (let i = 0; i < nextOrder.length; i++) {
				if (stable.has(i)) {
					continue;
				}
				const ctx = production.get(nextOrder[i]);
				const itemNode = ctx?.[templateId + Slot.Node];
				if (!itemNode) {
					continue;
				}
				const at = node.childNodes[i];
				if (at !== itemNode) {
					if (at) {
						node.insertBefore(itemNode, at);
					} else {
						node.appendChild(itemNode);
					}
				}
			}
		}
	}

	// --
	// Removes entries from production that are not in `nextKeySet`.
	// Only called when production.size > nextKeySet.size.
	_pruneStale(production, nextKeySet, effector, templateId) {
		const toRemove = [];
		for (const token of production.keys()) {
			if (!nextKeySet.has(token)) {
				toRemove.push(token);
			}
		}
		for (let i = 0; i < toRemove.length; i++) {
			const token = toRemove[i];
			this.template.unrender(production.get(token), effector, templateId);
			production.delete(token);
		}
	}

	_renderArrayIndexed(items, node, itemPos, context, effector, templateId) {
		let entries = context[this.id + Slot.State];
		if (!entries || !Array.isArray(entries)) {
			this._clearState(entries, effector, templateId);
			entries = context[this.id + Slot.State] = [];
		}
		const prevCount = entries.length >> 1;
		const n = items.length;

		for (let k = 0; k < n; k++) {
			const base = k << 1;
			const value = items[k];
			let ctx = entries[base];
			let shouldRender = false;

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
				shouldRender = true;
			} else {
				const existing =
					ctx[templateId + Slot.Node] ?? ctx[this.id + Slot.Node];
				const valueChanged = !(existing && Object.is(entries[base + 1], value));
				if (valueChanged) {
					this.valueSlot.set(value, true, ctx);
					this.keySlot.set(k, true, ctx);
					entries[base + 1] = value;
				}
				shouldRender = !existing;
			}
			if (shouldRender) {
				itemPos[1] = k;
				ctx[templateId + Slot.Node] = this.template.render(
					node,
					itemPos,
					ctx,
					effector,
					templateId,
				);
			}
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

	_renderKeyed(items, isArray, node, itemPos, context, effector, templateId) {
		let state = context[this.id + Slot.State];
		if (!state?.production || !state.order) {
			this._clearState(state, effector, templateId);
			state = context[this.id + Slot.State] = {
				production: new Map(),
				order: [],
			};
		}
		const production = state.production;
		const prevOrder = state.order;
		const nextOrder = [];
		const seen = new Set();
		const warnedDuplicates = new Set();
		const valueSlotId = this.valueSlot.id;
		const keySlotId = this.keySlot.id;
		const stateSlotId = this.id + Slot.State;
		const nodeSlotId = templateId + Slot.Node;
		const altNodeSlotId = this.id + Slot.Node;
		const rendersOnIndexChange = this.rendersOnIndexChange;

		if (isArray) {
			for (let i = 0; i < items.length; i++) {
				const value = items[i];
				let token = this.normalizeKey(this.resolveKey(value, i, context));
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

				let ctx = production.get(token);
				let shouldRender;
				if (!ctx) {
					ctx = Object.create(context);
					ctx[Slot.Parent] = context;
					ctx[Slot.Owner] = this;
					ctx[Slot.Name] = "MappingEffect";
					ctx[stateSlotId] = null;
					ctx[valueSlotId] = value;
					ctx[keySlotId] = i;
					production.set(token, ctx);
					shouldRender = true;
				} else {
					const existing = ctx[nodeSlotId] ?? ctx[altNodeSlotId];
					const valueChanged = !(
						existing && Object.is(ctx[valueSlotId], value)
					);
					if (valueChanged) {
						this.valueSlot.set(value, true, ctx);
						ctx[valueSlotId] = value;
					}
					const indexChanged = !Object.is(ctx[keySlotId], i);
					if (indexChanged) {
						this.keySlot.set(i, true, ctx);
						ctx[keySlotId] = i;
					}
					shouldRender =
						!existing || valueChanged || (indexChanged && rendersOnIndexChange);
				}
				if (shouldRender) {
					itemPos[1] = i;
					if (globalThis.__DEBUG_NOTIFY)
						console.log(`  rendering keyed template for i=${i}`);
					ctx[nodeSlotId] = this.template.render(
						node,
						itemPos,
						ctx,
						effector,
						templateId,
					);
				}
			}
		} else {
			// Object iteration
			let i = 0;
			for (const k in items) {
				const value = items[k];
				const token = k;
				seen.add(token);
				nextOrder.push(token);

				let ctx = production.get(token);
				let shouldRender;
				if (!ctx) {
					ctx = Object.create(context);
					ctx[Slot.Parent] = context;
					ctx[Slot.Owner] = this;
					ctx[Slot.Name] = "MappingEffect";
					ctx[stateSlotId] = null;
					ctx[valueSlotId] = value;
					ctx[keySlotId] = k;
					production.set(token, ctx);
					shouldRender = true;
				} else {
					const existing = ctx[nodeSlotId] ?? ctx[altNodeSlotId];
					const valueChanged = !(
						existing && Object.is(ctx[valueSlotId], value)
					);
					if (valueChanged) {
						this.valueSlot.set(value, true, ctx);
						ctx[valueSlotId] = value;
					}
					const indexChanged = !Object.is(ctx[keySlotId], k);
					if (indexChanged) {
						this.keySlot.set(k, true, ctx);
						ctx[keySlotId] = k;
					}
					shouldRender =
						!existing || valueChanged || (indexChanged && rendersOnIndexChange);
				}
				if (shouldRender) {
					itemPos[1] = i;
					ctx[nodeSlotId] = this.template.render(
						node,
						itemPos,
						ctx,
						effector,
						templateId,
					);
				}
				i++;
			}
		}

		// Reorder DOM nodes using LIS for minimum mutations.
		this._reorderDOM(node, production, nextOrder, prevOrder, templateId);

		// Prune removed keys.
		if (production.size > seen.size) {
			this._pruneStale(production, seen, effector, templateId);
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

		// Fast path: when items is empty/null/undefined, bulk-clear all
		// mapped nodes instead of going through per-item render paths.
		const isEmpty =
			!items ||
			(Array.isArray(items) && items.length === 0) ||
			(typeof items === "object" &&
				!Array.isArray(items) &&
				Object.keys(items).length === 0);
		if (isEmpty) {
			if (context[this.id + Slot.State]) {
				this._fastClear(node, context, effector, templateId);
			}
			return;
		}

		// Reusable position array to avoid allocating [position, i] per item
		const itemPos = [position, 0];

		if (Array.isArray(items)) {
			const firstAutoKey =
				items.length > 0 ? this.resolveKey(items[0], 0, context) : undefined;
			const shouldUseKeyed =
				typeof this.keyBy === "function" ||
				this.templateKey !== undefined ||
				(firstAutoKey !== undefined && firstAutoKey !== null);
			if (shouldUseKeyed) {
				this._renderKeyed(
					items,
					true,
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
			// Object inputs: use {production, order} with DOM reordering.
			this._renderKeyed(
				items,
				false,
				node,
				itemPos,
				context,
				effector,
				templateId,
			);
		}
	}

	unrender(context, effector) {
		const derived = super.unrender(context, effector);
		const state = derived[this.id + Slot.State];
		const templateId = this.template.id ?? this.id;
		if (state) {
			if (state.production instanceof Map) {
				for (const [, ctx] of state.production.entries()) {
					this.template.unrender(ctx, effector, templateId);
				}
				state.production.clear();
				state.order.length = 0;
			} else if (Array.isArray(state)) {
				// Flat array: [ctx0, val0, ctx1, val1, ...]
				for (let i = 0; i < state.length; i += 2) {
					if (state[i]) {
						this.template.unrender(state[i], effector, templateId);
					}
				}
				state.length = 0;
			}
		}
		derived[this.id + Slot.State] = undefined;
		derived[this.id + Slot.Node] = undefined;
		derived[this.id + Slot.Render] = undefined;
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
		if (this.input) {
			const meta = Slot.Derivation(context, this.input.id);
			if (meta && (meta.dirty || meta.stale)) {
				Slot.FlushDerived(context, this.input.id);
			}
		}
		// TODO: We need to know when we need to unrender/clear
		this.subrender(node, position, context, effector);
		const input = context[this.input?.id];
		let state = context[this.id + Slot.State];
		if (!state || typeof state !== "object" || !Object.hasOwn(state, "token")) {
			state = context[this.id + Slot.State] = {
				input: undefined,
				token: 0,
			};
		}
		const textNode = context[this.id + Slot.Node];
		// We make sure to guard a re-render, and only proceed if there'sure
		// a data change.
		if (!Object.is(input, state.input) || textNode === undefined) {
			state.input = input;
			// Promise semantics:
			// - keep currently rendered text while pending,
			// - only apply the latest pending promise result.
			const token = ++state.token;
			if (isPromiseLike(input)) {
				if (!textNode && node?.nodeType === Node.TEXT_NODE) {
					context[this.id + Slot.Node] = node;
				}
				Promise.resolve(input)
					.then((resolved) => {
						const current = context[this.id + Slot.State];
						if (
							!current ||
							current.token !== token ||
							!Object.is(current.input, input)
						) {
							return;
						}
						const output = this._format(resolved, node);
						const target = context[this.id + Slot.Node];
						if (!target) {
							context[this.id + Slot.Node] = effector.ensureText(
								node,
								position,
								output,
							);
							return;
						}
						target.data = output;
					})
					.catch((error) =>
						onRuntimeError(error, this.format?.toString(), {
							node,
							input,
						}),
					);
				return textNode ?? node;
			}

			const output = this._format(input, node);
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
			return "";
		}
	}

	unrender(context, effector) {
		const c = super.unrender(context, effector);
		const textNode = c[this.id + Slot.Node];
		if (textNode?.parentNode) {
			textNode.parentNode.removeChild(textNode);
		}
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
		let state = context[this.id + Slot.State];
		if (!state || typeof state !== "object" || !Object.hasOwn(state, "token")) {
			state = context[this.id + Slot.State] = {
				input: undefined,
				token: 0,
				attributeState: undefined,
			};
		}
		state.input = input;
		// Same async contract as FormattingEffect:
		// keep previous attribute value while pending and apply latest-only.
		const token = ++state.token;
		const resolveOutput = (candidate) => {
			if (isPromiseLike(candidate)) {
				Promise.resolve(candidate)
					.then((resolved) => {
						const current = context[this.id + Slot.State];
						if (!current || current.token !== token) {
							return;
						}
						current.attributeState = applyAttributeValue(
							node,
							node.namespaceURI,
							node.name,
							resolved,
							current.attributeState,
						);
					})
					.catch((error) =>
						onRuntimeError(error, this.format?.toString(), {
							node,
							input: candidate,
						}),
					);
				return;
			}
			state.attributeState = applyAttributeValue(
				node,
				node.namespaceURI,
				node.name,
				candidate,
				state.attributeState,
			);
		};
		if (isPromiseLike(input)) {
			Promise.resolve(input)
				.then((resolvedInput) => {
					const current = context[this.id + Slot.State];
					if (
						!current ||
						current.token !== token ||
						!Object.is(current.input, input)
					) {
						return;
					}
					resolveOutput(
						this.format ? this.format(resolvedInput) : resolvedInput,
					);
				})
				.catch((error) =>
					onRuntimeError(error, this.format?.toString(), {
						node,
						input,
					}),
				);
			return node;
		}
		resolveOutput(this.format ? this.format(input) : input);
		return node;
	}

	unrender(context, effector) {
		context[this.id + Slot.State] = undefined;
		super.unrender(context, effector);
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

	render(node, _position, context, _effector) {
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
			let previousTarget;
			if (context) {
				previousTarget = context[CURRENT_EVENT_TARGET];
				context[CURRENT_EVENT_TARGET] =
					event?.currentTarget ?? event?.target ?? previousTarget;
			}
			let res;
			try {
				res =
					typeof callback === "function" ? callback(event, ...rest) : undefined;
			} finally {
				if (context) {
					context[CURRENT_EVENT_TARGET] = previousTarget;
				}
			}
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
		if (!owner?.args) {
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

	render(node, _position, context, _effector) {
		this.input?.applyContext(context);
		const stateId = this.id + Slot.State;
		const eventName = this.event.startsWith("on")
			? this.event.substring(2)
			: this.event;
		const target = node?.ownerElement ?? context[this.id + Slot.Node];
		if (target) {
			context[this.id + Slot.Node] = target;
		}
		let state = context[stateId];
		if (!Object.hasOwn(context, stateId) || state === undefined) {
			if (!target) {
				return node;
			}
			state = context[stateId] = {
				context: context,
				target,
				eventName,
				wrapper: (...args) => {
					Context.Run(context, this.wrapper, args);
				},
			};
			// TODO: Should include the context id in the wrapper
			target.addEventListener(eventName, state.wrapper);
			if (node?.ownerElement) {
				target.removeAttributeNode(node);
			}
		} else if (target && state.target !== target) {
			if (state.target && state.wrapper) {
				state.target.removeEventListener(state.eventName, state.wrapper);
			}
			state.target = target;
			state.context = context;
			state.eventName = eventName;
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
	render(node, _position, context, _effector) {
		this.input?.applyContext(context);
		const stateId = this.id + Slot.State;
		const target = node?.ownerElement ?? context[this.id + Slot.Node];
		if (target) {
			context[this.id + Slot.Node] = target;
		}
		if (!Object.hasOwn(context, stateId) || context[stateId] === undefined) {
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
				Context.Run(context, this.wrapper, [target]);
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
	render(node, position, _context, effector) {
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
