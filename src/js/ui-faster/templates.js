import {
	ConditionalEffect,
	MappingEffect,
	FormattingEffect,
	TemplateEffect,
} from "./effects.js";
import { Context, Slot, Observable } from "./cells.js";
import { assign } from "./utils/collections.js";

// TODO: Shouldn't that be an Input?
// TODO: Not of these don't belong in templates, they are really about
// managing and processing input (derivations, selections), while templates
// are about wrapping all of that.

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
		// if any.
		const data = this.extraction
			? Slot.Expand(this.extraction, context)
			: context[Slot.Input];
		// NOTE: This won't work if we have for instance the same component
		// rendered multiple time in the same context. In this case, it will
		// keep the same context. However, if there's just one instance of the
		// injection, then it's all good, as it will have a unique id.
		const derived = (context[this.id] =
			context[this.id] ?? (this.derived ? Object.create(context) : {}));
		// We set the derived context.
		derived[Slot.Owner] = this;
		derived[Slot.Parent] = context;
		derived[Slot.Input] = data;
		// TODO: This is where we would copy cells/slots that are passed
		// with `out` or `inout`.
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of Slot.Match(this.args, data)) {
			derived[c.id] = v;
		}
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
	// as "any of the given values"
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

	map(component) {
		// TODO: Check that component is what we expect (ie. probably not
		// a component).
		return new MappingEffect(this, component);
	}

	// ========================================================================
	// CONTEXT-RELATED
	// ========================================================================

	applyContext(context) {
		const ctx = super.applyContext(context);
		// We define a subscription array for the selection.
		if (ctx[this.id + Slot.Observable] === undefined) {
			ctx[this.id + Slot.Observable] = new Observable(
				undefined,
				ctx,
				this.id
			);
		}
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

export class Argument extends Selection {
	constructor(name) {
		super(name);
		this.name = name;
	}

	get value() {
		return this.get();
	}

	set value(value) {
		this.set(value);
	}

	// TODO: Should this be there?
	set(value, context = Context.Get()) {
		if (context) {
			const obs = context[this.id + Slot.Observable];
			const previous = obs.value;
			obs.set(value);
			return previous;
		} else {
			console.error("COULD NOT SET, NO CONTEXT", this, context);
			throw new Error("Cell.set() invoked outside of context");
		}
	}

	get() {
		const context = Context.Stack.at(-1);
		return context ? context[this.id] : context;
	}

	toggle() {
		return this.set(this.get() ? false : true);
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

export class Application extends Selection {
	constructor(input, transform) {
		super();
		this.input = input;
		this.transform = transform;
	}
	applyContext(context) {
		// NOTE: We expect here that the input have already been resolved
		// and that the value are in the context.
		context[this.id] = this.transform(context[this.input.id]);
		return context;
	}
}

// --
// Takes a VDom node template, an input structure containing Argument/Cells
// to define an injection, and an optional name. Returns a function that returns
// a template effect that injects the arguments into the given input. That function
// can then be used to render the component.
export const factory = (template, input, name) =>
	Object.assign(
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
			),
		{
			component: name,
			template,
			input,
		}
	);
//EOF
