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
		const derived = this.input.applyContext(context);
		return this.template.render(node, position, derived, effector);
	}
}

export class ApplicationEffect extends Effect {
	constructor(inputs, template) {
		super(inputs);
		this.template = template;
	}
	render(node, position, context, effector) {
		// When we apply we create a new context detached from the previous
		// one, so that we don't leak values.
		let ctx = context[this.id];
		if (!context[this.id]) {
			ctx = {};
			ctx[Cell.Parent] = context;
			ctx[Cell.Input] = context[Cell.Input];
			context[this.id] = ctx;
		}
		return this.template.render(node, position, ctx, effector);
	}
}

export class ConditionalEffect extends Effect {
	constructor(input, branches) {
		super(input);
		this.branches = branches;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		const value = context[this.input.id];
		const j = context[this.id + Cell.State];
		let i = 0;
		let match = undefined;
		for (const [expected, predicate, branch] of this.branches) {
			if (!match && expected === "" && !predicate) {
				match = branch;
			} else if (
				(expected !== undefined && expected === value) ||
				(predicate && predicate(value))
			) {
				match = branch;
				break;
			}
			i++;
		}
		if (j == i) {
			console.log("TODO: No change");
		} else {
			context[this.id + Cell.State] = i;
		}

		return match.render(node, position, context, effector);
	}
}

// NOTE: It's actually faster and more memory efficient to have a single
// map for mapping effect visited nodes. That should be one per thread if
// we move that to web workers.
const visited = new Map();

export class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		const items = context[this.input.id];
		let mapping = context[this.id + Cell.State];
		if (!mapping) {
			context[this.id + Cell.State] = mapping = new Map();
		}
		let i = 0;
		for (const k in items) {
			let ctx = mapping.get(k);
			visited.set(k, true);
			if (!ctx) {
				ctx = Object.create(context);
				// We make sure that we can recurse this effect.
				ctx[this.id + Cell.State] = null;
				ctx[Cell.Input] = [items[k], k];
				mapping.set(k, ctx);
			} else {
				ctx[Cell.Input][0] = items[k];
				ctx[Cell.Input][1] = k;
			}
			// TODO: We need to transform V input the template input
			this.template.render(node, [position, i++], ctx, effector);
		}
		// FIXME: We should try to optimize that
		for (const k of [...mapping.keys()]) {
			if (!visited.has(k)) {
				const m = mapping.get(k);
				// TODO: Do something with the mapping there.
				mapping.delete(k);
			}
		}
		// We clear at the end
		visited.clear();
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
