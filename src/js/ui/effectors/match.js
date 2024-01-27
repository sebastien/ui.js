import { Effector, Effect } from "../effectors.js";

export class MatchEffector extends Effector {
	constructor(nodePath, selector, branches) {
		super(nodePath, selector);
		this.branches = branches;
	}

	apply(node, scope) {
		return new MatchEffect(this, node, scope).init();
	}
}

class MatchEffect extends Effect {
	constructor(effector, node, scope) {
		super(effector, node, scope);
		this.states = new Array(this.effector.length);
		this.currentBranchIndex = undefined;
	}

	unify(value, previous = this.value) {
		this.value = value;
		const branches = this.effector.branches;
		let index = undefined;
		let branch = undefined;
		for (let i = 0; i < branches.length; i++) {
			const b = branches[i];
			const { guard } = b;
			if (
				guard === true ||
				value === guard ||
				(guard instanceof Function && guard(value))
			) {
				index = i;
				branch = b;
				break;
			}
		}
		// FIXME: We should check that this works both for regular nodes
		// and slots as well.
		if (index !== undefined && this.states[index] === undefined) {
			// We apply the template effector at the match effect node, which
			// should be a comment node.
			// Options.debug &&
			//   console.log(
			//     `MatchEffector: creating based on matched branch ${index}`,
			//     { value }
			//   );
			this.states[index] = branch.template.apply(this.node, this.scope);
			// NOTE: Apply already calls init()
		}
		if (index !== this.currentBranchIndex) {
			// Options.debug &&
			//   console.log(
			//     `MatchEffector: mounting matched branch ${index}/${this.currentBranchIndex}`,
			//     { value }
			//   );
			index !== undefined && this.mounted && this.states[index].mount();

			const previousState = this.states[this.currentBranchIndex];
			// NOTE: We could cleanup the previous state if we wanted to
			if (previousState) {
				this.mounted && previousState.unmount();
				// TODO: We may want to deinit? -- Probably not, especially
				// if we're using tabs, or something like that.
			}
			this.currentBranchIndex = index;
		}
		return this;
	}
	mount() {
		const branch = this.states[this.currentBranchIndex];
		if (branch) {
			branch.mount();
		}
		return super.mount();
	}
	unmount() {
		const branch = this.states[this.currentBranchIndex];
		if (branch) {
			branch.unmount();
		}
		return super.unmount();
	}
	dispose() {
		for (let i = 0; i < this.states.length; i++) {
			const branch = this.states[i];
			branch.mounted && branch.unmount();
			branch.dispose();
			this.states[i] = undefined;
		}
		this.currentBranchIndex = undefined;
		return super.dispose();
	}
}
// EOF
