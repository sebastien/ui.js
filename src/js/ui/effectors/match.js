import { Effector, Effect } from "../effectors.js";
import Options from "../utils/options.js";

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
      branch = branches[i];
      if (branch.value === Any || value === branch.value) {
        index = i;
        break;
      }
    }
    // FIXME: We should check that this works both for regular nodes
    // and slots as well.
    if (this.states[index] === undefined) {
      // We apply the template effector at the match effect node, which
      // should be a comment node.
      Options.debug &&
        console.log(
          `MatchEffector: creating based on matched branch ${index}`,
          { value }
        );
      this.states[index] = branch.template.apply(this.node, this.scope);
    }
    if (index !== this.currentBranchIndex) {
      Options.debug &&
        console.log(
          `MatchEffector: mounting matched branch ${index}/${this.currentBranchIndex}`,
          { value }
        );
      this.states[index].init().mount();
      const previousState = this.states[this.currentBranchIndex];
      // NOTE: We could cleanup the previous state if we wanted to
      if (previousState) {
        previousState.unmount();
      }
      this.currentBranchIndex = index;
    }
    return this;
  }
}
// EOF
