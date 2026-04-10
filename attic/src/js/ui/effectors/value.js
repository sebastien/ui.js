import { Effect } from "../effectors.js";
import { AttributeEffector } from "./attribute.js";
import { Empty } from "../utils/values.js";

class ValueEffect extends Effect {
	unify(value, previous = this.value) {
		this.node[this.effector.name] = value === Empty ? null : value;
		return this;
	}
}

export class ValueEffector extends AttributeEffector {
	apply(node, scope) {
		return new ValueEffect(this, node, scope).init();
	}
}

// EOF
