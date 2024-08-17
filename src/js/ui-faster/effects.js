import { Context, Slot } from "./cells.js";
import { onError, onRuntimeError } from "./utils/logging.js";

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
			this.input?.observable(context).sub(rerender);
		}
	}

	// --
	// Unregisters the render function to be triggered when the input
	// changes.
	unsubrender(context) {
		const render_id = this.id + Slot.Render;
		if (context[render_id]) {
			this.input?.observable(context).unsub(context[render_id]);
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
	}
	render(node, position, context, effector) {
		// TODO: At rendering, we need to determine if the function has been
		// converted to a component, ie. has a `template` and `applicator`.
		if (!context[this.id]) {
			// We make sure the extracted values are made observable in the context
			for (const slot of Slot.Walk(this.input.extraction)) {
				slot?.observable(context);
			}
			// NOTE: Hopefully this is cleared
			context[this.id] = true;
		}
		const derived = this.input.applyContext(context);
		// TODO: Not sure if we need to do that?
		// derived[this.id] = undefined;
		if (!this.component.isComponent) {
			onError(
				"effects.ComponentEffect",
				"Given component function has not been initialised.",
				{ component: this.component }
			);
		}
		return this.component.template.render(
			node,
			position,
			derived,
			effector,
			this.id
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
		// TODO: At rendering, we need to determine if the function has been
		// converted to a component, ie. has a `template` and `applicator`.
		// const derived = this.input.applyContext(context);
		const { attributes, children, derivation } = this;
		context = this.derivation.applyContext(context);
		const value = context[this.derivation.id];
		if (value !== context[this.id]) {
			if (context[this.id] !== undefined) {
				console.warn("TODO: Clear out the previous component");
			}
			const component = this.factory(value);
			// TODO: Input is really expected to be an Injection
			this.input.args = component.input;
			const derived = this.input.applyContext(context);
			context[this.id] = value;
			return component.template.render(
				node,
				position,
				derived,
				effector,
				this.id
			);
		} else {
			// No change
		}
	}
	unrender(context, effector) {
		const derived = super.unrender(context, effector);
		derived[this.id]?.template.unrender(derived, effector, this.id);
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
				[Slot.Name]: Object.getPrototypeOf(this).constructor.name,
			};
			context[this.id] = ctx;
		}
		return this.template.render(node, position, ctx, effector, this.id);
	}
	unrender(context, effector) {
		const derived = super.unrender(derived, effector);
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

	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.subrender(node, position, context, effector);
		const value = context[this.input.id];
		// State is [previousBranchIndex, [...<context for each branch>]]
		let state = context[this.id + Slot.State];
		if (!state) {
			context[this.id + Slot.State] = state = [
				undefined,
				new Array(this.branches.length).fill(null),
			];
		}
		let i = 0;
		let match = undefined;
		for (const [type, condition, effect] of this.branches) {
			switch (type) {
				case 3: // Function
					if (condition(value)) {
						match = effect;
					}
					break;
				case 2: // Array of values
					for (const v of condition) {
						if (v == value) {
							match = effect;
							break;
						}
					}
					break;
				default:
					if (condition == value) {
						match = effect;
						break;
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
		if (i != state[0]) {
			// We need to unmount the previous state
			if (state[0] !== undefined) {
				const ctx = state[1][state[0]];
				if (ctx) {
					effector.unmount(ctx[Slot.Node]);
				}
			}
			state[0] = i;
			if (!state[1][i]) {
				// We derive a new state and we make sure that we clear
				// the slots for this cell in the context, so that we'll
				// set new values.
				const ctx = Object.create(context);
				Context.Clear(ctx, this.id);
				ctx[Slot.Owner] = this;
				ctx[Slot.Name] = Object.getPrototypeOf(this).constructor.name;
				ctx[Slot.Parent] = context;
				ctx[this.id] = state[1][i] = ctx;
			}
		}
		// We store the created/updated node
		return (state[1][i][Slot.Node] =
			match === undefined
				? undefined
				: match.render(node, position, state[1][i], effector, this.id));
	}
	// TODO: Unrender
}

export class MappingEffect extends Effect {
	constructor(input, factory, valueSlot, keySlot) {
		super(input);
		// TODO: template is going to be a function that should take `(value,key)`
		// where Value and Key will be slots as part of this mapping
		this.valueSlot = valueSlot;
		this.keySlot = keySlot;
		this.template = factory(valueSlot, keySlot);
	}

	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.subrender(node, position, context, effector);
		// We retrieve the mapped items, which are bound to this cell id.
		const items = context[this.input.id];
		// We retrieve the corresponding mapping state, typically `undefined`
		// on the first run.
		let mapping = context[this.id + Slot.State];
		// We retrieve the revision number, which we set to `1` at first.
		const revision = (context[this.id + Slot.Revision] =
			(context[this.id + Slot.Revision] || 0) + 1);
		// If there's no mapping defined, we create a new `Map`, which will
		// be used to hold the state.
		if (!mapping) {
			context[this.id + Slot.State] = mapping = new Map();
		}
		// Now we iterate over the keys for each item.
		let i = 0;
		// Note that the keys `k` will be strings, even if `items` is an Array.
		for (const k in items) {
			// We get any previously stored entry.
			// An entry is `[revision, context]`
			const entry = mapping.get(k);
			let ctx = (entry && entry[1]) || undefined;
			// If there's no context, then we have a new key.
			if (!ctx) {
				// We start by creating a derived context, so that derivations
				// won't affect the parent context.
				ctx = Object.create(context);
				ctx[Slot.Parent] = context;
				ctx[Slot.Owner] = this;
				ctx[Slot.Name] = Object.getPrototypeOf(this).constructor.name;
				// We make sure that we can recurse this effect by nullifying
				// the current node reference.
				// --
				// FIXME: That won't nullify other derivations already applied.
				// We need to detail this.
				ctx[this.id + Slot.State] = null;
				// We set the basic input for the context as the item's value
				// and its key.
				ctx[this.valueSlot.id] = items[k];
				ctx[this.keySlot.id] = k;
				// We register the mapped value and context in the mapping.
				mapping.set(k, [revision, ctx]);
			} else {
				// TODO: Shouldn't we detect if there's a change there?
				ctx[this.valueSlot.id] = items[k];
				ctx[this.keySlot.id] = k;
				// Only the revision has changed in the entry.
				entry[0] = revision;
			}
			// TODO: We should probably store the output DOM node?
			const res = this.template.render(
				node,
				[position, i++],
				ctx,
				effector,
				this.template.id ?? this.id
			);
		}
		// TODO: We should remove mapping ammping items that haven't been updated
		const to_remove = [];
		for (const [k, [rev]] of mapping.entries()) {
			if (rev !== revision) {
				to_remove.push(k);
			}
		}
		while (to_remove.length) {
			const k = to_remove.pop();
			this.template.unrender(
				mapping.get(k)[1],
				effector,
				this.template.id ?? this.id
			);
			mapping.delete(k);
		}
	}
	// NOTE: We don't do anything for unrender
}

export class FormattingEffect extends Effect {
	constructor(input, format, placeholder = null) {
		super(input);
		this.format = format;
		this.placeholder = placeholder;
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
			let output = undefined;
			try {
				output = this.format
					? // When the function has an `args`, we know that we need to pass
					  // more than one argument.
					  this.format.args
						? this.format(...input)
						: // Actually this form (one argument) should not be the default.
						  this.format(input)
					: `${input}`;
			} catch (error) {
				onRuntimeError(error, this.format.toString(), {
					node: node,
					input: this.format?.args ? [input] : input,
				});
			}
			context[this.id + Slot.State] = input;
			if (!textNode) {
				return (context[this.id + Slot.Node] = effector.ensureText(
					node,
					position,
					output
				));
			} else {
				textNode.data = output;
				return textNode;
			}
		} else {
			return textNode;
		}
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
		// TODO: If it's a style, we should merge it as an object
		node.value = output;
		return node;
	}
}

export class EventHandlerEffect extends Effect {
	// --
	// Ensures that the given `handler` function has a corresponding effect.
	static Ensure(handler, name) {
		if (!handler.effect) {
			handler.effect =
				name === "onmount" || name === "onunmount"
					? new LifecycleEventHandlerEffect(handler, name)
					: new EventHandlerEffect(handler, name);
		}
		return handler.effect;
	}
	constructor(handler, event) {
		super();
		this.handler = handler;
		this.event = event;
		this.wrapper = (event, ...rest) => {
			// TODO: We should set the context we're in.
			const res = handler(event);
			// TODO: We should do post-processing.
			return res;
		};
		// NOTE: This is a first pass at SSR with incremental loading
		// of components.
		// const uijs = (globalThis.uijs = globalThis.uijs || {});
		// uijs[`H${this.id}`] = this.wrapper;
	}

	render(node, position, context, effector) {
		if (context[this.id + Slot.State] === undefined) {
			const state = (context[this.id + Slot.State] = {
				context: context,
				wrapper: (...args) => {
					Context.Run(context, this.wrapper, args);
				},
			});
			// TODO: Should include the context id in the wrapper
			node.ownerElement.addEventListener(
				node.nodeName.substring(2),
				state.wrapper
			);
			node.ownerElement.removeAttributeNode(node);
		}
		// context = this.input.applyContext(context);
		// const input = context[this.input.id];
		// const output = this.format ? this.format(input) : input;
		// // TODO: If it's a style, we should merge it as an object
		// node.value = output;
		return node;
	}

	// TODO: Unrender?

	toString() {
		return `globalThis.uijs?.H${this.id}(...arguments)`;
	}
}

export class LifecycleEventHandlerEffect extends EventHandlerEffect {
	render(node, position, context, effector) {
		if (context[this.id + Slot.State] === undefined) {
			node.ownerElement.removeAttributeNode(node);
			context[this.id + Slot.State] = true;
		}
		if (!context[this.id]) {
			context[this.id] = (context[this.id] ?? 0) + 1;
			if (this.event === "onmount") {
				Context.Run(context, this.wrapper, [node]);
			}
		}
		return node;
	}
	unrender(context, effector, id) {
		context[this.id] = Math.max(0, (context[this.id] ?? 0) - 1);
		if (context[this.id] === 0 && this.event === "onunmount") {
			Context.Run(context, this.wrapper, context[this.id + Slot.Node]);
		}
		super.unrender(context, effector, id);
	}
}

// EOF
