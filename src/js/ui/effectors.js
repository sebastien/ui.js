import { onError } from "./utils/logging.js";
import { Scope } from "./reactive.js";

// --
// ## Effectors
//
//

// -- doc
// The effect scope encapsulates the state of an effector, including
// where it gets its data from.

export class EffectScope extends Scope {
	constructor(parent, path, key) {
		super(parent);
		this.path = path;
		this.key = key;
		// This is the path for this scope in the parent scope
		this.handlers = new Map();
		this.isComponentBoundary = false;
	}

	// FIXME: These are legacy
	set value(value) {
		onError("Should not set scope.value", { value });
	}

	get value() {
		onError("Should not get scope.value");
		return null;
	}

	derive(slots = undefined, path = this.path, key = this.key) {
		const res = new EffectScope(
			// NOTE: There's a bit of a risk here as if value is change from the
			// parent, it won't be changed here.
			this,
			path,
			key
		);
		// TODO: WE should explain how that works
		if (slots) {
			res.define(slots);
		}
		return res;
	}

	bindEvent(name, handler) {
		return (
			this.handlers.has(name)
				? this.handlers.get(name).push(handler)
				: this.handlers.set(name, [handler]),
			this
		);
	}

	unbindEvent(name, handler) {
		const handlers = this.handlers.get(name);
		if (!handlers) {
			return this;
		}
		const i = handlers.indexOf(handler);
		if (i !== -1) {
			handlers.splice(i, 1);
		}
		if (handlers.length === 0) {
			this.handlers.remove(name);
		}
		return this;
	}

	triggerEvent(name, data, origin = this, node, bubbles = true) {
		let scope = this;
		let count = 0;
		while (scope) {
			const handlers = scope.handlers.get(name);
			handlers &&
				handlers.forEach((handler) => {
					try {
						const res = handler(data, origin, scope, node);
						count += 1;
						// TODO: This could be stop
						if (res === false) {
							return count;
						}
					} catch (exception) {
						onError(`${name}: Handler failed`, {
							handler,
							exception,
							data,
						});
					}
				});
			scope = scope.parent;
			// The scope is a boundary, and we don't bubble, this means
			// an early exit.
			if (scope && scope.isComponentBoundary && !bubbles) {
				return count;
			}
		}
		return count;
	}

	get(path, offset = 0) {
		const k = path[offset];
		if (k === "#") {
			return this.key;
		} else {
			// Otherwise we resolve in the current scope
			return super.get(path, offset);
		}
	}

	toString() {
		return `EffectScope(path="${this.path.join(".")}", key="${this.key}")`;
	}
}

// --
// ## Effect
//
// Implements the base class of an effect.
export class Effect {
	constructor(effector, node, scope, selector = effector.selector) {
		this.effector = effector;
		this.selector = selector;
		this.node = node;
		this.scope = scope;
		this.value = undefined;
		//NOTE: These are really for debugging only
		this.mounted = 0;
		this.bound = 0;
		this.initialized = 0;

		// We perform some checks
		!node && onError("Effect(): effector should have a node", { node });

		// TODO: We need to do the binding
		// this.selection = selector && scope ? scope.select(selector) : null;
		const handler = (i) => (_) => {
			// FIXME: We should optimize this, as this will extract  all the values, otherwise
			// the selector will run again, and this is really not necessary.
			this.apply();
		};
		this.subs = selector
			? selector.inputs.map((_, i) => this.scope.sub(handler(i), _.path))
			: null;
	}

	bind() {
		// NOTE: This is left for debugging
		if (this.bound !== 0) {
			onError(`Effector bound more than once: ${this.mounted}`, {
				effector: this,
			});
		}
		this.bound += 1;
		return this;
	}

	unbind() {
		// TODO: Subscribe to the selection
		// NOTE: This is left for debugging
		if (this.bound === 0) {
			onError(`Effector not previously bound`, { effector: this });
		} else if (this.bound !== 1) {
			onError(`Effector bound more than once: ${this.bound}`, {
				effector: this,
			});
		}
		this.bound = 0;
		return this;
	}

	init() {
		if (this.initialized !== 0) {
			onError(`Effector already initialized: ${this.initialized}`, {
				effector: this,
			});
		}
		this.initialized += 1;
		this.apply();
		this.bind();
		return this;
	}

	apply() {
		// We extract the latest value from the selection
		const value = this.scope.eval(this.selector);
		// If the current selector has a target, we assign the target. Note that
		// this could also be done at the scope level by creating a reducer or
		// just assigning the node there.
		if (this.selector?.target && !this.selector?.isMany) {
			console.log("XXX FIXME Skipping scope.et", {
				target: this.selector.target,
				value,
			});
			// this.scope.set(this.selector.target, value);
		}
		return this.unify(value, this.value);
	}

	unify(current, previous = this.value) {
		onError("Effect.unify not implemented", {
			this: this,
			parent: Object.getPrototypeOf(this),
		});
	}

	mount() {
		// NOTE: This is left for debuggigng
		if (this.mounted !== 0) {
			onError(`Effector mounted more than once: ${this.mounted}`, {
				effector: this,
			});
		}
		this.mounted += 1;
		return this;
	}

	unmount() {
		// NOTE: This is left for debuggigng
		if (this.mounted === 0) {
			onError(`Effector not mounted`, { effector: this });
		} else if (this.mounted !== 1) {
			onError(`Effector mounted more than once: ${this.mounted}`, {
				effector: this,
			});
		}
		this.mounted = 0;
		return this;
	}

	dispose() {
		// The effector may not have been mounted, or may already have been
		// unmounted at that point.
		if (this.mounted) {
			this.unmount();
		}
		this.unbind();
		return this;
	}

	onChange(value, event) {
		// The value is already extracted when `onChange` is called.
		this.unify(value, this.value);
	}
}

export class Effector {
	// -- doc
	//
	// An effector targets the node at the given `nodePath` and selects data
	// using the given `selector`.
	constructor(nodePath, selector) {
		this.nodePath = nodePath;
		// The selector may be empty, as not all effectors create a selection.
		this.selector = selector;
	}

	// --
	// An effector is applied when the effect need to be instantiated
	apply(node, scope) {
		onError("Effector.apply: no implementation defined", {
			node,
			scope,
		});
	}
}

// EOF
