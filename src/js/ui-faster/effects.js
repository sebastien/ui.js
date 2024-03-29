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
		return this.template.render(node, position, derived, effector, this.id);
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
		return this.template.render(node, position, ctx, effector, this.id);
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
		// State is [previousBranchIndex, [...<context for each branch>]]
		let state = context[this.id + Cell.State];
		if (!state) {
			context[this.id + Cell.State] = state = [
				undefined,
				new Array(this.branches.length).fill(null),
			];
		}
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
		if (i != state[0]) {
			// We need to unmount the previous state
			if (state[0] !== undefined) {
				console.log("TODO: Conditional unmoutn previous branch", state);
			}
			state[0] = i;
			state[1][i] = state[1][i] ?? Object.create(context);
		}

		// We store the created/updated node
		return (state[1][i][Cell.Node] = match.render(
			node,
			position,
			state[1][i],
			effector,
			this.id
		));
	}
}

export class MappingEffect extends Effect {
	constructor(input, template) {
		super(input);
		this.template = template;
	}
	render(node, position, context, effector) {
		context = this.input.applyContext(context);
		const items = context[this.input.id];
		let mapping = context[this.id + Cell.State];
		const revision = (context[this.id + Cell.Revision] =
			(context[this.id + Cell.Revision] || 0) + 1);

		if (!mapping) {
			context[this.id + Cell.State] = mapping = new Map();
		}
		let i = 0;
		for (const k in items) {
			// Entry is `[revision, context]`
			const entry = mapping.get(k);
			let ctx = (entry && entry[1]) || undefined;
			if (!ctx) {
				ctx = Object.create(context);
				// We make sure that we can recurse this effect.
				ctx[this.id + Cell.State] = null;
				ctx[Cell.Input] = [items[k], k];
				mapping.set(k, [revision, ctx]);
			} else {
				ctx[Cell.Input][0] = items[k];
				ctx[Cell.Input][1] = k;
				entry[0] = revision;
			}
			// TODO: We should probably store the output DOM node?
			const res = this.template.render(
				node,
				[position, i++],
				ctx,
				effector,
				this.template.id
			);
		}
		// TODO: We should remove the ammping items that haven't been updated
		for (const [k, [rev]] of mapping.entries()) {
			if (rev !== revision) {
				console.log("TODO: Mapping remove key", k);
			}
		}
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
		const textNode = context[this.id];
		if (!textNode) {
			return (context[this.id] = effector.ensureText(
				node,
				position,
				text
			));
		} else {
			textNode.data = text;
			return textNode;
		}
	}
}
// EOF
