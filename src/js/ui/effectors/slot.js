import { onError } from "../utils/logging.js";
import { isEmpty, isAtom } from "../utils/values.js";
import { DOM, createComment } from "../utils/dom.js";
import { trigger } from "../utils/collections.js";
import { Controllers, createController } from "../controllers.js";
import { Effector, Effect } from "../effectors.js";
import { Selector } from "../selector.js";
import { Templates } from "../templates.js";

//
// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
export class SlotEffector extends Effector {
	constructor(nodePath, selector, templateName, handlers, bindings) {
		super(nodePath, selector);
		// TODO: Selectors for slots should not have a format, slots pass
		// down the value directly to a template.
		//
		// The handlers map event names to the path at which the incoming
		// events should be stored/relayed.
		this.handlers = handlers;
		this.bindings = bindings;
		// Note that template name can also be a selector here.
		this.templateName = templateName;
		this._controller = undefined;
		if (!templateName) {
			onError(
				`SlotEffector: template is not specified, use ContentEffector instead`,
				{ nodePath, selector }
			);
		} else if (typeof templateName === "string") {
			// TODO: We should replace these by Enum
			this.templateType = "str";
			this._template = undefined;
		} else if (templateName instanceof Selector) {
			this.templateType = "sel";
			this._template = undefined;
		} else if (templateName instanceof Effector) {
			this.templateType = "eff";
			this._template = templateName;
		} else {
			onError(
				"SlotEffector: template should be string, selector or effector",
				{
					template: templateName,
				}
			);
		}
	}

	get controller() {
		// NOTE: There is an edge case where the component is rendered but
		// the controller is not registered yet.
		if (this._controller === undefined && this.templateName) {
			this._controller = Controllers.get(this.templateName) || null;
		}
		return this._controller;
	}

	// -- doc
	// The effector `template` is lazily resolved, as it may not have been
	// defined at time of declaration.
	get template() {
		if (this._template) {
			return this._template;
		} else {
			switch (this.templateType) {
				case "str":
					this._template =
						Templates.get(this.templateName) ||
						onError(
							`SlotEffector: Could not find template '${this.templateName}'`,
							[...Templates.keys()]
						);
					break;
				case "eff":
					this._template = this.templateName;
					break;
				default:
			}
			return this._template;
		}
	}

	apply(node, scope) {
		// If we have bindings, we may need to derive a local scope, so that
		// new slots can be crated without affecting the parent and that
		// parent slots are not overriden. The exception, however, being
		// that the bindings are all defined in the parent scope.
		let should_derive = this.selector?.target ? true : false;
		if (this.bindings) {
			for (const k in this.bindings) {
				const v = this.bindings[k];
				if (v !== undefined || !this.scope.slots[k]) {
					should_derive = true;
					break;
				}
			}
		}
		const effect_scope = should_derive ? scope.derive() : scope;
		const effect = new (this.selector?.isMany
			? MappingSlotEffect
			: SingleSlotEffect)(this, node, effect_scope, this.template).init();
		return this.templateType === "sel"
			? new DynamicTemplateEffect(
					this,
					node,
					effect_scope,
					this.templateName,
					effect
			  ).init()
			: effect;
	}
}

// --
// This wraps another effect and changes the template.
class DynamicTemplateEffect extends Effect {
	constructor(effector, node, scope, templateSelector, effect) {
		super(effector, node, scope, templateSelector);
		templateSelector instanceof Selector ||
			onError(
				"DynamicTemplateEffect: template selector is not a Selector instance",
				{ templateSelector, effector, node, scope }
			);
		this.effect = effect;
	}

	resolveTemplate(template) {
		const res =
			typeof template === "string"
				? Templates.get(template)
				: template instanceof Effector
				? template
				: null;
		res ||
			onError(
				`DynamicTemplateEffect: unable to resolve template '${template}'`,
				{ template }
			);
		return res;
	}

	apply() {
		return this.unify(this.resolveTemplate(this.selection.value));
	}

	unify(current, previous = this.value) {
		if (current !== previous) {
			if (this.selector.target) {
				this.scope.set(this.selector.target, current);
			}
			this.value = current;
			// The template has changed
			this.effect.dispose();
			this.effect.template = current;
			this.effect.apply();
		}
	}
}

// This is the generic, abstract version of a slot effect. This is
// specialized by `SingleSlotEffect` and `MultipleSlotEffect`.
class SlotEffect extends Effect {
	constructor(effector, node, scope, template) {
		super(effector, node, scope);
		this.handlers = {};
		this.template = template;
		this.controller = undefined;
		if (this.effector.bindings) {
			// We bindings do define a new slot
			this.scope.define(this.effector.bindings, true);
		}
		if (template && template.bindings) {
			// And the templates complement it
			this.scope.define(template.bindings, false);
		}
	}
	bind() {
		super.bind();
		const scope = this.scope;
		const handlers = this.effector.handlers;
		// FIXME: We should put this back and explain
		// const parentLocalPath = this.parentLocalPath;
		// if (handlers) {
		//   for (const k in handlers) {
		//     const targetPath = composePaths(parentLocalPath, handlers[k]);
		//     // We relay the event from the subscribed path to the parent path.
		//     const h = (event) => {
		//       scope.state.put(targetPath, event);
		//     };
		//     this.handlers[k] = h;
		//     scope.state.sub([...scope.localPath, k], h);
		//   }
		// }

		if (!this.controller && this.effector.controller) {
			this.controller = createController(
				this.effector.controller,
				this.scope,
				this.node
			);
			trigger(this.controller.events.get("Bind"), this, scope);
		}
	}
	unbind() {
		const res = super.unbind();
		const scope = this.scope;
		// FIXME: Implement this back
		// for (const k in this.handlers) {
		//   const p = [...scope.localPath, k];
		//   scope.state.sub(p, this.handlers[k]);
		// }
		if (this.controller) {
			// TODO: Should call unbind
			trigger(this.controller.events.get("Unbind"), this, scope);
			this.controller = undefined;
		}
		return res;
	}
	init(...args) {
		trigger(this.effector.controller?.events?.get("Init"), this, ...args);
		return super.init();
	}
	mount(...args) {
		const res = super.mount(...args);
		const events = this.controller?.events;
		if (events) {
			trigger(events.get("Mount"), this, ...args);
			for (const [name, handlers] of events.entries()) {
				for (const h of handlers) {
					this.scope.bindEvent(name, h);
				}
			}
		}
		return res;
	}
	unmount(...args) {
		const events = this.effector.controller?.events;
		if (events) {
			trigger(events.get("Unmount"), this, ...args);
			for (const [name, handlers] of events.entries()) {
				for (const h of handlers) {
					this.scope.unbindEvent(name, h);
				}
			}
		}
		return super.unmount(...args);
	}
}

class SingleSlotEffect extends SlotEffect {
	constructor(effector, node, scope, template) {
		super(effector, node, scope, template);
		this.effect = undefined;
	}

	unify(current, previous = this.value) {
		if (this.selector?.target) {
			this.scope.set(this.selector.target, current);
		}
		if (!this.effect) {
			const node = createComment(
				// FIXME: add a better description of that part
				`_|SingleSlotEffect`
			);
			DOM.after(this.node, node);

			// TODO: We should only derive a scope if we have bindings there
			// if (this.effector.bindings) {
			//   scope.updateLocal(this.effector.bindings);
			// }

			this.effect = this.template
				?.apply(
					node, // node
					this.scope
				)
				?.init()
				?.mount();
			return this.effect;
		} else if (current !== previous) {
			this.effect.unify(current, previous);
		}
	}
	mount(...args) {
		this.effect?.mount(...args);
		return super.mount(...args);
	}
	unmount(...args) {
		this.effect.unmount(...args);
		return super.unmount(...args);
	}
	dispose(...args) {
		this.effect?.dispose(...args);
		return super.dispose(...args);
	}
}

// --
// Implements the mapping of a slot for each item of a collection.
class MappingSlotEffect extends SlotEffect {
	constructor(effector, node, scope, template) {
		super(effector, node, scope, template);
		// FIXME: This may not be necessary anymore
		// We always go through a change
		// this.selection.alwaysChange = true;
		this.items = undefined;
	}

	// --
	// ### Lifecycle

	unify(current, previous = this.value) {
		// We prepare from comparing the current state with the previous state,
		// and do the corresponding operations to unify.
		const { node, scope } = this;
		const isCurrentEmpty = isEmpty(current);
		const isPreviousEmpty = isEmpty(previous);
		const isCurrentAtom = isAtom(current);

		const { target, path } = this.effector.selector;
		// NOTE: Target should not be null

		// FIXME: This should be moved to the slot effector. We also need
		// to retrieve the key.
		// ### Case: Empty
		if (isCurrentEmpty) {
			if (!isPreviousEmpty && this.items) {
				for (const item of this.items.values()) {
					item.unmount();
					item.dispose();
				}
				this.items?.clear();
			} else {
				// Nothing to do
			}
		} else if (isCurrentAtom) {
			// ### Case: Atom
			const items = this.items ? this.items : (this.items = new Map());
			if (current !== previous) {
				const item = items.get(null);
				if (item) {
					// Nothing to do, the item effectors will already be subscribed
					// to the change.
					item.scope.set(target || "_", current);
				} else {
					items.set(
						null,
						this.createItem(
							this.template,
							node, // node
							// FIXME: Should we set the key to null?
							scope.derive({ [target || "_"]: current }, path), // scope
							true // isEmpty
						)
					);
				}
			}
		} else if (current instanceof Array) {
			// ### Case: Array
			const items = this.items ? this.items : (this.items = new Map());
			for (let i = 0; i < current.length; i++) {
				const item = items.get(i);
				if (!item) {
					const subscope = scope.derive(
						{ [target || "_"]: current[i] },
						[...path, i],
						i
					);
					items.set(
						i,
						this.createItem(
							this.template,
							node, // node
							subscope,
							undefined,
							i
						)
					);
				} else {
					if (!previous || current[i] !== previous[i]) {
						item.scope.set(target || "_", current[i]);
						item.apply();
					} else {
						// No change in item
					}
				}
			}
			// We cleanup any item that is not used anymore
			let j = current.length;
			let item = null;
			while ((item = items.get(j))) {
				item.unmount();
				item.dispose();
				items.delete(j);
				j++;
			}
		} else {
			// ### Case: Object
			const items = this.items ? this.items : (this.items = new Map());
			for (const k in current) {
				const item = items.get(k);
				if (!item) {
					const subscope = scope.derive(
						{ [target || "_"]: current[k] },
						[...path, k],
						k
					);
					items.set(
						k,
						this.createItem(
							this.template,
							node, // node
							subscope,
							undefined,
							k
						)
					);
				} else {
					if (!previous || current[k] !== previous[k]) {
						item.scope.set(target || "_", current[k]);
						item.apply();
					}
				}
			}
			for (const k of items.keys()) {
				if (current[k] === undefined) {
					const item = items.get(k);
					if (item) {
						item.unmount();
						item.dispose();
					}
					this.items.delete(k);
				}
			}
		}
		this.value = current;
		return this;
	}

	// -- doc
	// Creates a new item node in which the template can be rendered.
	createItem(template, node, scope, isEmpty = false, key = undefined) {
		// TODO: Should have a better comment
		const root = createComment(
			`out:content=${this.effector.selector.toString()}#${key || 0}`
		);
		// We need to insert the node before as the template needs a parent
		if (!node.parentNode) {
			onError(
				"MappingSlotEffect.createItem: node has no parent element",
				{
					node,
					path: scope.path,
				}
			);
		} else {
			// TODO: Should use DOM.after
			node.parentNode.insertBefore(root, node);
		}
		return template
			? template
					.apply(
						root, // node
						scope
					)
					.init()
					.mount()
			: null;
	}
	mount(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				item?.mount();
			}
		}
		return super.mount(...args);
	}
	unmount(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				item?.unmount();
			}
		}

		return super.unmount(...args);
	}
	dispose(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				item?.dispose();
			}
		}
		return super.dispose(...args);
	}
}

// EOF
