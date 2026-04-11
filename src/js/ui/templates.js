import {
	ConditionalEffect,
	MappingEffect,
	FormattingEffect,
	TemplateEffect,
} from "./effects.js";
import { Context, Slot } from "./cells.js";
import { assign } from "./utils/collections.js";
import { getSignature } from "./utils/inspect.js";

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
	}

	applyContext(context) {
		// First we extract an initial data from the extraction pattern,
		// if any, otherwise we default from the input slot.
		const data = this.extraction ? this.extraction : context[Slot.Input];
		// NOTE: This won't work if we have for instance the same component
		// rendered multiple time in the same context. In this case, it will
		// keep the same context. However, if there's just one instance of the
		// injection, then it's all good, as it will have a unique id.
		const derived = (context[this.id] =
			context[this.id] ?? (this.derived ? Object.create(context) : {}));

		// Check if we have a cached match result from a previous render
		const stateKey = this.id + Slot.State;
		const cached = context[stateKey];
		if (cached) {
			// Re-render path: reuse the cached match tuples, just update values.
			// The structure (which slots map to which data slots) doesn't change,
			// only the resolved values in the context may have changed.
			for (let i = 0; i < cached.length; i++) {
				const slot = cached[i][0];
				const v = cached[i][1];
				if (v instanceof Slot) {
					derived[slot.id] = context[v.id];
					derived[slot.id + Slot.Observable] =
						context[v.id + Slot.Observable];
					derived[slot.id + Slot.Revision] =
						context[v.id + Slot.Revision];
				}
				// Non-slot values don't change between renders, no update needed
			}
			return derived;
		}

		// First render path: compute the match and cache it
		// We set the derived context.
		derived[Slot.Owner] = this;
		derived[Slot.Parent] = context;
		derived[Slot.Name] = "Injection";
		// TODO: This is where we would copy cells/slots that are passed
		// with `out` or `inout`.
		//… where the args values are extracted and mapped to their cell ids;
		const matches = Slot.Match(this.args, data, context);
		for (let i = 0; i < matches.length; i++) {
			const slot = matches[i][0];
			const v = matches[i][1];
			if (v instanceof Slot) {
				// If the target value is a slot, then we make sure that if it's
				// removed, we update it.
				derived[slot.id] = context[v.id];
				// NOTE: This will effectively fuse the cell, if it's updated
				// locally, it will update upwards and vice-versa.
				derived[slot.id + Slot.Observable] =
					context[v.id + Slot.Observable];
				// FIXME: Not sure about revision, that should be in observable?
				derived[slot.id + Slot.Revision] =
					context[v.id + Slot.Revision];
			} else {
				// This is a regular value
				derived[slot.id] =
					typeof v === "function"
						? (...args) => Context.Run(context, v, args)
						: v;
			}
			slot.observable(derived);
		}
		// Cache the match results for subsequent re-renders
		context[stateKey] = matches;
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
			return this.else(template);
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
				: `${formatter}`
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

	map(func) {
		// TODO: Check that component is what we expect (ie. probably not
		// a component).
		// TODO: Why do we have two selections as argument?
		return new MappingEffect(this, func, new Selection(), new Selection());
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
		const obs = context && context[this.id + Slot.Observable];
		return obs ? obs.sub(handler) : null;
	}

	unsub(handler, context = Context.Get()) {
		const obs = context && context[this.id + Slot.Observable];
		return obs ? obs.unsub(handler) : null;
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
			const obs = this.observable(ctx);
			// Input needs to operate in the parent context
			const updater = () => {
				// FIXME: Updates seem to be triggered too many times
				obs.set(Slot.Expand(this.input, context));
			};
			Slot.Each(this.input, (slot) => {
				slot.observable(context).sub(updater);
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
					this.updater && this.updater(value);
				} finally {
					Context.Pop(context);
				}
			};
			const obs = this.observable(context);
			obs.sub(handler);
			context[this.id + Slot.State] = [handler];
			if (this.source instanceof Slot) {
				const extractor = this.extractor;
				// NOTE: If we force here, we'll get a loop
				const updater = (value) => {
					obs.set(extractor ? extractor(value) : value);
				};
				context[this.id] = context[this.source.id];
				this.source.observable(context).sub(updater);
				context[this.id + Slot.State].push(updater);
			}
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
			assign(
				scope,
				arg.path,
				arg.id === undefined ? null : context[arg.id]
			);
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
		this.placeholderNodeType = Node.COMMENT_NODE;
	}

	applyContext(context) {
		// If there's an input, we apply its context
		if (context[this.id + Slot.State] === undefined) {
			this.input.applyContext(context);
			const handler = this.isMultipleArguments
				? (value) => this.set(this.transform(...value), false, context)
				: (value) => this.set(this.transform(value), false, context);
			this.input.observable(context).sub(handler);
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
		this.input.applyContext(context);
		let state = context[this.id + 6];
		if (!state) {
			state = context[this.id + 6] = {
				mode: undefined,
				template: undefined,
				context: undefined,
				anchor: undefined,
			};
		}
		if (state.mode === undefined && !this.isMultipleArguments) {
			const candidate = this.transform(this.input);
			if (candidate && typeof candidate.render === "function") {
				state.mode = "template";
				state.template = candidate;
				state.context = Object.assign(Object.create(context), {
					[Slot.Owner]: this,
					[Slot.Parent]: context,
					[Slot.Name]: Object.getPrototypeOf(this).constructor.name,
				});
			}
		}
		if (state.mode === "template") {
			this.input.observable(context);
			if (node?.nodeType === Node.TEXT_NODE) {
				state.anchor =
					state.anchor && state.anchor.parentNode
						? state.anchor
						: document.createComment(`Application:${this.id}`);
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
				id
			);
		}

		context = this.applyContext(context);
		const render_id = this.id + Slot.Render;
		if (!context[render_id]) {
			const rerender = () => this.render(node, position, context, effector, id);
			context[render_id] = rerender;
			this.observable(context).sub(rerender);
		}
		const output = context[this.id];
		if (output && typeof output.render === "function") {
			if (node?.nodeType === Node.TEXT_NODE) {
				state.anchor =
					state.anchor && state.anchor.parentNode
						? state.anchor
						: document.createComment(`Application:${this.id}`);
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
				id
			);
		}
		return effector.ensureContent(node, position, output);
	}

	unrender(context, effector, id = this.id) {
		const state = context[this.id + 6];
		if (state?.mode === "template") {
			if (state.template?.unrender && state.context) {
				state.template.unrender(state.context, effector, id);
			}
			return;
		}
		const render_id = this.id + Slot.Render;
		if (context[render_id]) {
			this.observable(context).unsub(context[render_id]);
			context[render_id] = undefined;
		}
		if (state?.template?.unrender && state.context) {
			state.template.unrender(state.context, effector, id);
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
				: null
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
