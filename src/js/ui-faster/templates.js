import {
	ConditionalEffect,
	MappingEffect,
	TemplateEffect,
	ApplicationEffect,
	FormattingEffect,
} from "./effects.js";
import { Cell } from "./cells.js";
import { getSignature } from "./utils/inspect.js";
import { assign } from "./utils/collections.js";

export class Injection extends Cell {
	constructor(args) {
		super();
		this.args = args;
	}
	applyContext(context) {
		const data = context[Cell.Input];
		const derived = (context[this.id] =
			context[this.id] ?? Object.create(context));
		derived[Cell.Parent] = context;
		//… where the args values are extracted and mapped to their cell ids;
		for (const [c, v] of Cell.Match(this.args, data)) {
			derived[c.id] = v;
		}
		return derived;
	}
}
export class Selection extends Cell {
	then(func) {
		return new Derivation(this, func);
	}

	fmt(text) {
		// FIXME: Not that
		return new FormattingEffect(this, () => text);
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

export class Derivation extends Selection {
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

export const template = (component) => {
	if (component.template) {
		return component.template;
	} else {
		const args = [];
		for (const { path, name } of getSignature(component).args) {
			const input = new Argument(name);
			assign(args, path, input);
		}
		const res = (component.template = new TemplateEffect(
			new Injection(args),
			undefined,
			args,
			component.name
		));
		res.template = component(...args);
		return res;
	}
};

export const select = (args) =>
	args instanceof Selection ? args : new Selection(new Injection(args));

export const $ = select;
// EOF
