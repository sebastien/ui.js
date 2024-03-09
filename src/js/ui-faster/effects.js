import { Cell } from "./cells.js";

export class Effect extends Cell {
	constructor(input) {
		super();
		this.input = input;
	}
}
export class TemplateEffect extends Effect {
	constructor(inputs, template, args, name) {
		super(inputs);
		this.template = template;
		// NOTE: Not in input, the inputs are actually
		this.args = args;
		this.name = name;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		this.template.render(node, position, context, effector);
	}
}

export class ConditionalEffect extends Effect {
	constructor(input, branches) {
		super(input);
		this.branches = branches;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		const current = context[this.input.id];
		let match = undefined;
		for (const [value, predicate, branch] of this.branches) {
			if (!match && value === "" && !predicate) {
				match = branch;
			} else if (
				(value !== undefined && value === current) ||
				(predicate && predicate(current))
			) {
				match = branch;
				break;
			}
		}
		match.render(node, position, context, effector);
	}
}

export class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
	}
	render(node, position, context, effector) {
		const items = context[this.input.id];
		const subcontext = (context[this.id + Cell.State] =
			context[this.id + Cell.State] ?? new Map());
		let i = 0;
		for (const k in items) {
			let ctx = subcontext.get(k);
			if (!ctx) {
				ctx = Object.create(context);
				ctx[Cell.Input] = [items[k], k];
				subcontext.set(k, ctx);
			} else {
				ctx[Cell.Input][0] = items[k];
				ctx[Cell.Input][1] = k;
			}
			// TODO: We need to transform V input the template input
			this.template.render(node, [position, i++], ctx, effector);
		}
		// TODO: We should clear any node that has been removed
		//
	}
}

export class FormattingEffect extends Effect {
	constructor(input, format) {
		super(input);
		this.format = format;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		const text = context[this.input.id];
		effector.ensureText(node, position, text);
	}
}
// EOF
