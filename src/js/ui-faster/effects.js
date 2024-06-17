import { Slot } from "./cells.js";

export class Effect extends Slot {
	constructor(input) {
		super();
		this.input = input;
	}

	render(node, position, context, effector) {
		effector.ensureContent(node, position, context[this.id]);
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
			ctx[Slot.Parent] = context;
			ctx[Slot.Input] = context[Slot.Input];
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
		let state = context[this.id + Slot.State];
		if (!state) {
			context[this.id + Slot.State] = state = [
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
		return (state[1][i][Slot.Node] = match.render(
			node,
			position,
			state[1][i],
			effector,
			this.id,
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
				// We make sure that we can recurse this effect by nullifying
				// the current node reference.
				// --
				// FIXME: That won't nullify other derivations already applied.
				// We need to detail this.
				ctx[this.id + Slot.State] = null;
				// We set the basic input for the context as the item's value
				// and its key.
				ctx[Slot.Input] = [items[k], k];
				// We register the mapped value and context in the mapping.
				mapping.set(k, [revision, ctx]);
			} else {
				// TODO: Shouldn't we detect if there's a change there?
				ctx[Slot.Input][0] = items[k];
				ctx[Slot.Input][1] = k;
				// Only the revision has changed in the entry.
				entry[0] = revision;
			}
			// TODO: We should probably store the output DOM node?
			const res = this.template.render(
				node,
				[position, i++],
				ctx,
				effector,
				this.template.id,
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
		const input = context[this.input.id];
		const output = this.format(input);
		const textNode = context[this.id];
		if (!textNode) {
			return (context[this.id] = effector.ensureText(
				node,
				position,
				output,
			));
		} else {
			textNode.data = output;
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
		const input = context[this.input.id];
		const output = this.format ? this.format(input) : input;
		// TODO: If it's a style, we should merge it as an object
		node.value = output;
		return node;
	}
}
// EOF
