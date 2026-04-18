import { Context, Slot } from "./cells.js";
import {
	ConditionalEffect,
	ContextBoundEffect,
	FormattingEffect,
	MappingEffect,
	TemplateEffect,
} from "./effects.js";
import { assign } from "./utils/collections.js";
import { getSignature } from "./utils/inspect.js";

const BOUND_CONTEXT = Symbol.for("ui.boundContext");
const INJECTION_ALIASES = Symbol.for("ui.injection.aliases");
const INJECTION_SOURCES = Symbol.for("ui.injection.sources");

// TODO: Shouldn't that be an Input?
// TODO: Not of these don't belong in templates, they are really about
// managing and processing input (derivations, selections), while templates
// are about wrapping all of that.

// TODO: Lifecycle management as well, have a `dispose()`
// TODO: Every sub should have an unsub
// TODO: There's still a lack of clartiy between Slot/Effects and  their lifeccyle

// --
// Derivations are cells that have the ability to derive the current context
// into a new context using `applyContext`. The derivation is idempotent, meaning
// that `applyContext(context)` will return the same result given the same context,
// typically by mutating the `context` and registering the return value within it.
export class Derivation extends Slot {
	// When a cell is applied to given context, it can create a derived
	// context.
	applyContext(context) {
		return context;
	}
}

// --
// An injections remaps `args` as an array
export class Injection extends Derivation {
	constructor(args, derived = false, extraction = undefined) {
		super();
		// This is the arguments structure that is going to be injected. Typically
		// this is a list of arguments, like `[Argument, Argument]`, but it could
		// also be a list with a dict like `[{label:Argument,id:Argument,style:Argument],Argument]`
		this.args = args;
		// Extraction is also a structure containing `Argument` values (and
		// potentially regular JS values. It helps reshape a value from the
		// current context before injecting it into the sub context.
		this.extraction = extraction;
		// When `derived` is true, the new context will inherit from the parent
		// context, otherwise it will be blank.
		this.derived = derived;
		// Pre-compute the match structure when extraction is known at construction time.
		// This avoids running Slot.Match on every first render for each context.
		this._preMatch = extraction ? Slot.Match(args, extraction) : null;
	}

	applyContext(context) {
		const resolvedAliasSources = new WeakMap();
		// When reading a slot's value for injection, prefer the slot's
		// own canonical context (Signal.context) over the parent rendering
		// context. This ensures that a Signal whose value was updated in
		// its own context (via signal.set()) is read correctly, even when
		// the parent rendering context still holds a stale copy from the
		// initial Cell.applyContext call.
		const readSlotValue = (slot) => {
			const srcCtx = slot.context || context;
			const meta = Slot.Derivation(srcCtx, slot.id);
			if (meta && (meta.dirty || meta.stale)) {
				Slot.FlushDerived(srcCtx, slot.id);
			}
			return srcCtx[slot.id];
		};
		const assignInjectedSlotValue = (target, id, value) => {
			if (!Object.is(target[id], value)) {
				target[id] = value;
				const revOff = id + 2; // Slot.Revision
				target[revOff] = (target[revOff] || 0) + 1;
				Slot.MarkDependentsDirty(target, id);
			}
		};
		const setInjectionAlias = (
			derived,
			targetSlot,
			sourceSlot,
			sourceContext,
		) => {
			const getResolvedSource = (context, slotId) => {
				if (!context) {
					return {
						sourceContext: context,
						sourceId: slotId,
					};
				}
				let byId = resolvedAliasSources.get(context);
				if (!byId) {
					byId = new Map();
					resolvedAliasSources.set(context, byId);
				}
				const hit = byId.get(slotId);
				if (hit) {
					return hit;
				}
				const value = resolveSource(context, slotId);
				byId.set(slotId, value);
				return value;
			};
			const resolveSource = (context, slotId) => {
				let currentContext = context;
				let currentId = slotId;
				let depth = 0;
				while (currentContext && depth < 64) {
					depth += 1;
					let aliasContext = currentContext;
					let found;
					while (aliasContext) {
						const alias = aliasContext[INJECTION_ALIASES]?.get?.(currentId);
						if (alias?.sourceContext) {
							found = alias;
							break;
						}
						aliasContext = aliasContext[Slot.Parent];
					}
					if (!found) {
						break;
					}
					currentContext = found.sourceContext;
					currentId = found.sourceId;
				}
				return {
					sourceContext: currentContext,
					sourceId: currentId,
				};
			};
			const removeReverseAlias = (
				context,
				sourceId,
				targetContext,
				targetId,
			) => {
				const bySource = context?.[INJECTION_SOURCES];
				const targets = bySource?.get?.(sourceId);
				if (!targets?.length) {
					return;
				}
				for (let i = targets.length - 1; i >= 0; i--) {
					const entry = targets[i];
					if (entry?.context === targetContext && entry?.id === targetId) {
						targets.splice(i, 1);
					}
				}
				if (!targets.length) {
					bySource.delete(sourceId);
				}
			};
			const addReverseAlias = (context, sourceId, targetContext, targetId) => {
				if (!context) {
					return;
				}
				const bySource =
					context[INJECTION_SOURCES] ||
					(context[INJECTION_SOURCES] = new Map());
				const targets = bySource.get(sourceId) || [];
				for (let i = 0; i < targets.length; i++) {
					const entry = targets[i];
					if (entry?.context === targetContext && entry?.id === targetId) {
						return;
					}
				}
				targets.push({ context: targetContext, id: targetId });
				bySource.set(sourceId, targets);
			};
			const startContext = sourceSlot?.context || sourceContext;
			const resolved = getResolvedSource(startContext, sourceSlot.id);
			const ownerContext = resolved.sourceContext;
			const sourceId = resolved.sourceId;
			const aliases =
				derived[INJECTION_ALIASES] || (derived[INJECTION_ALIASES] = new Map());
			const previous = aliases.get(targetSlot.id);
			if (
				previous?.sourceContext &&
				(previous.sourceContext !== ownerContext ||
					previous.sourceId !== sourceId)
			) {
				removeReverseAlias(
					previous.sourceContext,
					previous.sourceId,
					derived,
					targetSlot.id,
				);
			}
			aliases.set(targetSlot.id, {
				sourceId: sourceId,
				sourceContext: ownerContext,
			});
			addReverseAlias(ownerContext, sourceId, derived, targetSlot.id);
		};
		const bindFunctionToContext = (fn) => {
			const bound = fn?.[BOUND_CONTEXT] ? fn[BOUND_CONTEXT] : context;
			return Object.assign(
				function (...args) {
					const finalArgs =
						args.length === 0 && this !== undefined && this !== globalThis
							? [this]
							: args;
					return Context.Run(bound, fn, finalArgs);
				},
				{
					[BOUND_CONTEXT]: bound,
				},
			);
		};
		const expandShape = (value) => {
			if (value instanceof Slot) {
				// Preserve Slot identity so that the injection re-render
				// loop takes the reactive alias path (v instanceof Slot)
				// rather than the plain-value path. Without this, Slots
				// passed as component props get resolved to their current
				// context value, which breaks the INJECTION_ALIAS chain
				// and prevents Signal.context-based propagation.
				// The actual value is read later via readSlotValue().
				return value;
			}
			if (Array.isArray(value)) {
				return value.map((_) => expandShape(_));
			}
			if (value && Object.getPrototypeOf(value) === Object.prototype) {
				const res = {};
				for (const k in value) {
					res[k] = expandShape(value[k]);
				}
				return res;
			}
			return value;
		};
		const inputData = this.extraction
			? expandShape(this.extraction)
			: context[Slot.Input];
		// First we extract an initial data from the extraction pattern,
		// if any, otherwise we default from the input slot.
		// NOTE: This won't work if we have for instance the same component
		// rendered multiple time in the same context. In this case, it will
		// keep the same context. However, if there's just one instance of the
		// injection, then it's all good, as it will have a unique id.
		// NOTE: We use arrays instead of plain objects for derived contexts
		// because V8 stores sparse integer-keyed properties on objects in
		// dictionary mode (~80 bytes/entry), while arrays use holey elements
		// mode (~8 bytes/entry) as long as the gap is below kMaxGap (1024).
		const derived = (context[this.id] =
			context[this.id] ?? (this.derived ? Object.create(context) : {}));

		// Check if we have a cached match result from a previous render.
		// The match array is flat: [slot0, value0, slot1, value1, ...].
		const stateKey = this.id + Slot.State;
		const cached = context[stateKey];
		if (cached) {
			const cachedMatches = cached.matches || cached;
			const cachedInput = cached.input;
			// Ensure parent injection values are fresh before reading.
			// This handles the case where a Cell value changed but the
			// parent template hasn't re-rendered (e.g. conditional remount).
			// Slot.Owner=1, Slot.Parent=2
			const parentInjection = context[1];
			if (parentInjection instanceof Injection && context[2]) {
				parentInjection.applyContext(context[2]);
			}
			const rematched =
				cachedInput !== inputData
					? Slot.Match(this.args, inputData, context, [])
					: null;
			const matches = rematched?.length ? rematched : cachedMatches;
			context[stateKey] = {
				input: inputData,
				matches,
			};
			// Re-render path: reuse the cached match pairs, just update values.
			// The structure (which slots map to which data slots) doesn't change,
			// only the resolved values in the context may have changed.
			for (let i = 0; i < matches.length; i += 2) {
				const slot = matches[i];
				const v = matches[i + 1];
				const isRenderableChildren =
					slot?.name === "children" && v && typeof v.render === "function";
				if (v instanceof Slot && !isRenderableChildren) {
					if (typeof v.applyContext === "function") {
						v.applyContext(context);
					}
					assignInjectedSlotValue(derived, slot.id, readSlotValue(v));
					setInjectionAlias(derived, slot, v, context);
					if (!context[v.id + Slot.Observable]) {
						context[v.id + Slot.Observable] = [];
					}
					derived[slot.id + Slot.Observable] = context[v.id + Slot.Observable];
				} else if (isRenderableChildren) {
					derived[slot.id] = new ContextBoundEffect(v, context);
				} else {
					derived[slot.id] =
						typeof v === "function" ? bindFunctionToContext(v) : v;
				}
			}
			return derived;
		}

		// First render path: use pre-computed match or compute dynamically
		// We set the derived context.
		derived[Slot.Owner] = this;
		derived[Slot.Parent] = context;
		derived[Slot.Name] = "Injection";
		// Use pre-computed match if available, otherwise compute from context input.
		// Returns a flat array: [slot0, value0, slot1, value1, ...]
		const matches = this._preMatch
			? this._preMatch
			: Slot.Match(this.args, inputData, context);
		for (let i = 0; i < matches.length; i += 2) {
			const slot = matches[i];
			const v = matches[i + 1];
			const isRenderableChildren =
				slot?.name === "children" && v && typeof v.render === "function";
			if (v instanceof Slot && !isRenderableChildren) {
				if (typeof v.applyContext === "function") {
					v.applyContext(context);
				}
				assignInjectedSlotValue(derived, slot.id, readSlotValue(v));
				setInjectionAlias(derived, slot, v, context);
				// Share the parent's subscriber array so that subscriptions
				// in the derived context propagate to the parent.
				if (!context[v.id + Slot.Observable]) {
					context[v.id + Slot.Observable] = [];
				}
				derived[slot.id + Slot.Observable] = context[v.id + Slot.Observable];
			} else {
				// This is a regular value — no Observable needed eagerly.
				// If something subscribes later, slot.observable(derived)
				// will create one on demand.
				derived[slot.id] =
					typeof v === "function"
						? bindFunctionToContext(v)
						: slot?.name === "children" && v && typeof v.render === "function"
							? new ContextBoundEffect(v, context)
							: v;
			}
		}
		// Cache the match results for subsequent re-renders
		context[stateKey] = {
			input: inputData,
			matches,
		};
		return derived;
	}
}

// --
// Utility class that offers the `case` and `else` methods for branches/
// conditionals.
class Branches {
	constructor() {
		this.branches = [];
		this.elseBranch = undefined;
	}

	// --
	// Chainable function to define a branch, condition can be a function
	// or a value. If the function is an array, then it will be interpreted
	//as "any of the given values"
	case(...args) {
		if (args.length === 1) {
			return this.else(args[0]);
		}
		const condition =
			args.length === 2 ? args[0] : args.slice(0, args.length - 1);
		const template = args[args.length - 1];
		this.branches.push([
			condition instanceof Function ? 3 : args.length > 2 ? 2 : 1,
			condition,
			template,
		]);
		return this;
	}

	else(template) {
		this.elseBranch = template;
		return this;
	}
}

export class Selection extends Derivation {
	apply(func) {
		return new Application(this, func);
	}

	text(formatter) {
		// FIXME: Not that
		return new FormattingEffect(
			this,
			typeof formatter === "function"
				? formatter
				: formatter === null || formatter === undefined
					? formatter
					: `${formatter}`,
		);
	}

	// NOTE: Disabled
	//	render(tmpl) {
	//		return new ApplicationEffect(this, tmpl);
	//	}

	match(...branches) {
		const b = branches.reduce((r, v) => (v(r), r), new Branches());
		return new ConditionalEffect(this, b.branches, b.elseBranch);
	}

	map(func, keyBy = undefined) {
		// TODO: Check that component is what we expect (ie. probably not
		// a component).
		// TODO: Why do we have two selections as argument?
		return new MappingEffect(
			this,
			func,
			new Selection(),
			new Selection(),
			keyBy,
		);
	}

	// ========================================================================
	// CONTEXT-RELATED
	// ========================================================================

	applyContext(context) {
		const ctx = super.applyContext(context);
		// FIXME: Should we make this observable?
		// this.observable(ctx);
		return ctx;
	}

	sub(handler, context = Context.Get()) {
		if (context) {
			const subs = context[this.id + Slot.Observable];
			if (subs) {
				subs.push(handler);
				return true;
			}
		}
		return null;
	}

	unsub(handler, context = Context.Get()) {
		if (context) {
			return Slot.Unsub(context, this.id, handler);
		}
		return null;
	}
}

// Maybe that's an injection?
export class Subscription extends Selection {
	constructor(input, multiple = false) {
		super();
		this.input = input;
		this.isMultipleArguments = multiple;
	}
	apply(func) {
		return new Application(this, func, this.isMultipleArguments);
	}

	applyContext(context) {
		const ctx = super.applyContext(context);
		if (ctx[this.id + Slot.State] === undefined) {
			this.observable(ctx);
			// Input needs to operate in the parent context
			const updater = () => {
				// FIXME: Updates seem to be triggered too many times
				Slot.Notify(ctx, this.id, Slot.Expand(this.input, context), true);
			};
			Slot.Each(this.input, (slot) => {
				Slot.Sub(context, slot.id, updater);
			});
			ctx[this.id] = Slot.Expand(this.input, context);
			ctx[this.id + Slot.State] = updater;
		}
		return ctx;
	}
}
export class Argument extends Selection {
	constructor(name) {
		super(name);
		this.name = name;
	}
}

// --
// A selection that stores state and that can update to and from
// an original source.
export class Cell extends Selection {
	constructor(source, updater, extractor) {
		super();
		this.source = source;
		// FIXME: Names are not ideal
		this.updater = updater;
		this.extractor = extractor;
	}
	applyContext(context) {
		if (context[this.id + Slot.State] === undefined) {
			// TODO: And we should also re-register
			const handler = (value) => {
				// It's important that we put the context here, as
				// otherwise we'll be operating on a child context.
				Context.Push(context);
				try {
					context[this.id] = value;
					this.updater?.(value);
				} finally {
					Context.Pop(context);
				}
			};
			this.observable(context);
			Slot.Sub(context, this.id, handler);
			context[this.id + Slot.State] = [handler];
			if (this.source instanceof Slot) {
				const extractor = this.extractor;
				const selfId = this.id;
				// NOTE: If we force here, we'll get a loop
				const updater = (value) => {
					Slot.Notify(
						context,
						selfId,
						extractor ? extractor(value) : value,
						true,
					);
				};
				context[this.id] = context[this.source.id];
				Slot.Sub(context, this.source.id, updater);
				context[this.id + Slot.State].push(updater);
				const sourceContext = this.source.context;
				if (sourceContext && sourceContext !== context) {
					const canonicalUpdater = (value) => {
						Slot.Notify(
							context,
							selfId,
							extractor ? extractor(value) : value,
							true,
						);
					};
					Slot.Sub(sourceContext, this.source.id, canonicalUpdater);
					context[this.id + Slot.State].push(canonicalUpdater);
					if (!Object.is(context[this.id], sourceContext[this.source.id])) {
						context[this.id] = sourceContext[this.source.id];
					}
				}
			} else if (!Object.hasOwn(context, this.id)) {
				context[this.id] = this.extractor
					? this.extractor(this.source)
					: this.source;
			}
		}
		return context;
	}
}

export class Signal extends Cell {
	constructor(source, context = {}) {
		super(source);
		this.context = context || {};
		this.applyContext(this.context);
	}

	applyContext(context = this.context) {
		const result = super.applyContext(context);
		// When a Signal is applied to a non-canonical context (e.g. an
		// external owner), subscribe to changes there and mirror them
		// back to the Signal's own context. This ensures that injection
		// reads (which resolve via signal.context) see the latest value
		// even when set() targeted the external context.
		if (context !== this.context && context) {
			const syncKey = this.id + Slot.State + 1;
			if (!context[syncKey]) {
				const selfId = this.id;
				const canonical = this.context;
				let syncing = false;
				Slot.Sub(context, selfId, (value) => {
					// Guard against re-entrancy: Notify on canonical
					// may trigger INJECTION_SOURCES that feed back.
					if (syncing) {
						return;
					}
					syncing = true;
					try {
						Slot.Notify(canonical, selfId, value, true);
					} finally {
						syncing = false;
					}
				});
				context[syncKey] = true;
			}
		}
		return result;
	}

	observable(context = this.context) {
		return super.observable(context);
	}

	get(context = this.context) {
		return context ? Context.Run(context, () => super.get()) : super.get();
	}

	set(value, force = true, context = this.context) {
		const result = super.set(value, force, context);
		if (context === this.context) {
			const current = Context.Get();
			if (current && current !== context) {
				Slot.Notify(current, this.id, value, false);
			}
		}
		return result;
	}

	update(dict, context = this.context) {
		return context
			? Context.Run(context, () => super.update(dict, context))
			: super.update(dict, context);
	}

	touch(context = this.context) {
		return context
			? Context.Run(context, () => super.touch(context))
			: super.touch(context);
	}

	sub(handler, context = this.context) {
		return super.sub(handler, context);
	}

	unsub(handler, context = this.context) {
		return super.unsub(handler, context);
	}
}

export class DerivedCell extends Selection {
	constructor(shape, processor, lazy = false) {
		super();
		this.shape = shape;
		this.processor = processor;
		this.lazy = !!lazy;
	}

	applyContext(context) {
		if (context[this.id + Slot.State] === undefined) {
			Slot.Each(this.shape, (dependency) => {
				if (
					dependency &&
					typeof dependency.applyContext === "function" &&
					dependency !== this
				) {
					dependency.applyContext(context);
				}
			});
			Slot.Derive(this.shape, this.processor, this.lazy, this, context);
			context[this.id + Slot.State] = true;
		}
		return context;
	}
}

// --
// An extraction represents a selection of more than one arguments, mapped
// into the resulting value.
export class Extraction extends Selection {
	constructor(args) {
		super();
		// Args is like `{id,path:[]}`
		this.args = args;
	}
	applyContext(context) {
		const scope = (context[this.id] = context[this.id] || []);
		for (const arg of this.args) {
			assign(scope, arg.path, arg.id === undefined ? null : context[arg.id]);
		}
		return context;
	}
}

// FIXME: What's the use case for that?
export class DynamicEvaluation extends Selection {
	constructor(evaluator) {
		super();
		this.evaluator = evaluator;
	}
	applyContext(context) {
		const value = Context.Run(context, this.evaluator);
		this.value = value;
		context[this.id] = value;
		return context;
	}
}

export class Application extends Selection {
	constructor(input, transform, multiple = false) {
		super();
		this.input = input;
		this.transform = transform;
		this.isMultipleArguments = multiple;
		this.placeholderNodeType = globalThis.Node?.COMMENT_NODE ?? 8;
	}

	applyContext(context) {
		// If there's an input, we apply its context
		if (context[this.id + Slot.State] === undefined) {
			this.input.applyContext(context);
			const handler = this.isMultipleArguments
				? (value) => this.set(this.transform(...value), false, context)
				: (value) => this.set(this.transform(value), false, context);
			Slot.Sub(context, this.input.id, handler);
			// NOTE: We expect here that the input have already been resolved
			// and that the value are in the context.
			const v = context[this.input.id];
			context[this.id] = this.isMultipleArguments
				? this.transform(...v)
				: this.transform(v);
			context[this.id + Slot.State] = handler;
		}

		return context;
	}

	render(node, position, context, effector, id = this.id) {
		this.applyContext(context);
		// Render state is stored at Slot.Render (+5) as [rerender, renderState]
		// where renderState tracks template detection and anchor nodes.
		let rs = context[this.id + Slot.Render];
		let state = rs ? rs[1] : undefined;
		if (state === undefined) {
			// Check if this is a template mode (transform returns a renderable)
			if (!this.isMultipleArguments) {
				const candidate = context[this.id];
				if (candidate && typeof candidate.render === "function") {
					// No child context needed — template effects have globally
					// unique IDs, so they won't collide with parent context keys.
					state = {
						mode: "template",
						template: candidate,
						context: undefined,
						anchor: undefined,
					};
				} else {
					// Mark as non-template to skip this check on re-render
					state = false;
				}
			} else {
				state = false;
			}
			if (rs) {
				rs[1] = state;
			} else {
				rs = context[this.id + Slot.Render] = [null, state];
			}
		}
		if (state && state.mode === "template") {
			if (node?.nodeType === Node.TEXT_NODE) {
				state.anchor = state.anchor?.parentNode
					? state.anchor
					: document.createComment("");
				if (node.parentNode && state.anchor !== node) {
					node.parentNode.replaceChild(state.anchor, node);
				}
				node = state.anchor;
			}
			return state.template.render(
				node,
				position,
				state.context ?? context,
				effector,
				id,
			);
		}

		context = this.applyContext(context);
		// Refresh rs reference — applyContext may have switched context
		rs = context[this.id + Slot.Render];
		if (!rs) {
			const rerender = () => this.render(node, position, context, effector, id);
			rs = context[this.id + Slot.Render] = [rerender, state];
			Slot.Sub(context, this.id, rerender);
		} else if (!rs[0]) {
			const rerender = () => this.render(node, position, context, effector, id);
			rs[0] = rerender;
			Slot.Sub(context, this.id, rerender);
		}
		const output = context[this.id];
		if (output && typeof output.render === "function") {
			// Upgrade state to an object if needed for anchor tracking
			if (!state) {
				state = { anchor: undefined, context: undefined };
				rs[1] = state;
			}
			if (node?.nodeType === Node.TEXT_NODE) {
				state.anchor = state.anchor?.parentNode
					? state.anchor
					: document.createComment("");
				if (node.parentNode && state.anchor !== node) {
					node.parentNode.replaceChild(state.anchor, node);
				}
				node = state.anchor;
			}
			return output.render(
				node,
				position,
				state.context ?? context,
				effector,
				id,
			);
		}
		return effector.ensureContent(node, position, output);
	}

	unrender(context, effector, id = this.id) {
		const rs = context[this.id + Slot.Render];
		const state = rs ? rs[1] : undefined;
		if (state?.mode === "template") {
			if (state.template?.unrender) {
				state.template.unrender(state.context ?? context, effector, id);
			}
			return;
		}
		if (rs?.[0]) {
			Slot.Unsub(context, this.id, rs[0]);
			context[this.id + Slot.Render] = undefined;
		}
		if (state?.template?.unrender) {
			state.template.unrender(state.context ?? context, effector, id);
		}
	}
}

// --
// Takes a VDom node template, an input structure containing Argument/Cells
// to define an injection, and an optional name. Returns a function that returns
// a template effect that injects the arguments into the given input. That function
// can then be used to render the component.
export const application =
	(template, input) =>
	// The application, takes arguments and maps them to the input, rendering
	// the underlying template.
	(...args) =>
		new TemplateEffect(
			// Injects the arguments in `pattern` from the context input, without
			// inheriting the parent context.
			new Injection(input, false, null),
			template,
			args.length > 0
				? Object.assign({}, args[0], {
						children: args.slice(1),
					})
				: null,
		);

export const component = (component) => {
	if (component.isComponent) {
		return component;
	} else {
		// We extract the signature from the component function
		// definition. Each argument is then assigned in `args`, which
		// will hold the shape of the input.
		const args = [];
		for (const { path, name } of getSignature(component).args) {
			assign(args, path, new Argument(name));
		}
		// We need to set the input early, as it's going to be accessed
		// in `createElement` if we recurse on the component.
		component.isComponent = true;
		// FIXME: Should probably be args, not input
		component.input = args[0];
		component.template = component(...args);
		component.application = application(component.template, args[0]);
		return component;
	}
};
//EOF
