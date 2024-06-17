import {
	ConditionalEffect,
	MappingEffect,
	TemplateEffect,
	ApplicationEffect,
	FormattingEffect,
} from "./effects.js";
import { Slot, Cell } from "./cells.js";
import { getSignature } from "./utils/inspect.js";
import { assign } from "./utils/collections.js";

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
	constructor(args) {
		super();
		this.args = args;
	}
	applyContext(context) {
		const data = context[Slot.Input];
		const derived = (context[this.id] =
			context[this.id] ?? Object.create(context));
		derived[Slot.Parent] = context;
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of Slot.Match(this.args, data)) {
			derived[c.id] = v;
		}
		return derived;
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
				: () => (text ? `${text}` : text),
		);
	}

	apply(tmpl) {
		return new ApplicationEffect(this, template(tmpl));
	}

	match(cases) {
		const branches = [];
		// TODO: we should do parsing here
		for (const [k, v] of Object.entries(cases)) {
			for (const _ of k.split(",")) {
				branches.push([_, null, v]);
			}
		}
		return new ConditionalEffect(this, branches);
	}

	map(component) {
		return new MappingEffect(this, template(component));
	}
}

export class Argument extends Selection {
	constructor(name) {
		super(name);
		this.name = name;
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
		console.log("SIG", getSignature(component));
		for (const { path, name } of getSignature(component).args) {
			const input = new Argument(name);
			assign(args, path, input);
		}
		// We create a template effect that starts with an injection of the
		// arguments into the rendered context.
		const res = (component.template = new TemplateEffect(
			new Injection(args),
			undefined,
			args,
			component.name,
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
		cells: new Proxy(
			{},
			{
				get: (scope, property) => {
					return new Cell(undefined, property);
				},
			},
		),
	},
);

export const $ = select;

// EOF
