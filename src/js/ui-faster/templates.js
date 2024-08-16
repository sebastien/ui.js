import {
	ConditionalEffect,
	MappingEffect,
	FormattingEffect,
	TemplateEffect,
} from "./effects.js";
import { Context, Slot, Observable } from "./cells.js";
import { assign } from "./utils/collections.js";
import { getSignature } from "./utils/inspect.js";

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

	// FIXME: This should be made incremental, this will be re-applied on
	// every render.
	applyContext(context) {
		// First we extract an initial data from the extraction pattern,
		// if any, otherwise we default from the input slot.
		// const data = this.extraction
		// 	? Slot.Expand(this.extraction, context)
		// 	: context[Slot.Input];
		//
		const data = this.extraction ? this.extraction : context[Slot.Input];
		// NOTE: This won't work if we have for instance the same component
		// rendered multiple time in the same context. In this case, it will
		// keep the same context. However, if there's just one instance of the
		// injection, then it's all good, as it will have a unique id.
		const derived = (context[this.id] =
			context[this.id] ?? (this.derived ? Object.create(context) : {}));
		// We set the derived context.
		derived[Slot.Owner] = this;
		derived[Slot.Parent] = context;
		// TODO: This is where we would copy cells/slots that are passed
		// with `out` or `inout`.
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of Slot.Match(this.args, data, context)) {
			if (v instanceof Slot) {
				// If the target value is a slot, then we make sure that if it's
				// removed, we update it.
				derived[c.id] = context[v.id];
				// NOTE: This will effectively fuse the cell, if it's updated
				// locally, it will update upwards and vice-versa.
				derived[c.id + Slot.Observable] =
					context[v.id + Slot.Observable];
				derived[c.id + Slot.Revision] = context[v.id + Slot.Revision];
			} else {
				// This is a regular value
				derived[c.id] = v;
			}
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
		// We define a subscription array for the selection.
		if (ctx[this.id + Slot.Observable] === undefined) {
			ctx[this.id + Slot.Observable] = new Observable(
				undefined,
				ctx,
				this.id,
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
				arg.id === undefined ? null : context[arg.id],
			);
		}
		return context;
	}
}

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
		component.input = args[0];
		component.template = component(...args);
		component.application = application(component.template, args[0]);
		return component;
	}
};
//EOF
