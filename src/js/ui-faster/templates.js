import {
	ConditionalEffect,
	MappingEffect,
	TemplateEffect,
	ApplicationEffect,
	FormattingEffect,
} from "./effects.js";
import { Context, Slot, Observable } from "./cells.js";
import { getSignature } from "./utils/inspect.js";
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

export class Injection extends Derivation {
	constructor(args, derived = false) {
		super();
		this.args = args;
		// When `derived` is true, the new context will inherit from the parent
		// context, otherwise it will be blank.
		this.derived = derived;
	}
	applyContext(context) {
		const data = context[Slot.Input];
		const derived = (context[this.id] =
			context[this.id] ?? (this.derived ? Object.create(context) : {}));
		derived[Slot.Owner] = this;
		derived[Slot.Parent] = context;
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
	then(func) {
		return new Application(this, func);
	}

	fmt(formatter) {
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

	apply(tmpl) {
		return new ApplicationEffect(this, template(tmpl));
	}

	match(...branches) {
		const b = branches.reduce((r, v) => (v(r), r), new Branches());
		return new ConditionalEffect(this, b.branches, b.elseBranch);
	}

	map(component) {
		return new MappingEffect(this, template(component));
	}

	// ========================================================================
	// CONTEXT-RELATED
	// ========================================================================

	applyContext(context) {
		const ctx = super.applyContext(context);
		// We define a subscription array for the selection.
		if (ctx[this.id + Slot.Value] === undefined) {
			ctx[this.id + Slot.Value] = new Observable(undefined, ctx, this.id);
		}
		return ctx;
	}

	sub(handler, context = Context.Get()) {
		const obs = context && context[this.id + Slot.Value];
		return obs ? obs.sub(handler) : null;
	}

	unsub(handler, context = Context.Get()) {
		const obs = context && context[this.id + Slot.Value];
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
			const obs = context[this.id + Slot.Value];
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
// Takes the given `component` function, and returns its derivation
// template, creating it if necessary. The creation of the template inspects
// the function to extract its arguments signature,
export const template = (component) => {
	if (component.template) {
		return component.template;
	} else {
		// We extract the signature from the component function
		// definition. Each argument is then assigned in `args`, which
		// will hold the shape of the input.
		const args = [];
		for (const { path, name } of getSignature(component).args) {
			const input = new Argument(name);
			assign(args, path, input);
		}
		// We create a template effect that starts with an injection of the
		// arguments into the rendered context.
		const res = (component.template = new TemplateEffect(
			// A `template` is for a component, so the injection is *not* derived.
			new Injection(args, false),
			undefined,
			args,
			component.name
		));
		res.template = component(...args);
		res.args = args;
		return res;
	}
};

// Creates a new `Selection` out of the given arguments.
export const select = Object.assign(
	(args) =>
		args instanceof Selection ? args : new Selection(new Injection(args)),
	{
		// NOTE: Disabling
		// cells: new Proxy(
		// 	{},
		// 	{
		// 		get: (scope, property) => {
		// 			return new Cell(undefined, property);
		// 		},
		// 	},
		// ),
	}
);

export const $ = select;

// EOF
