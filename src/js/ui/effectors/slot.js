import { onError } from "../utils/logging.js";
import { isEmpty, isAtom } from "../utils/values.js";
import { DOM, createComment } from "../utils/dom.js";
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
		if (!templateName) {
			onError(
				`SlotEffector: template is not specified, use ContentEffector instead`,
				{ nodePath, selector },
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
				},
			);
		}
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
							[...Templates.keys()],
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
		// new slots can be created without affecting the parent and that
		// parent slots are not overridden. The exception, however, being
		// that the bindings are all defined in the parent scope.
		let should_derive = this.selector?.target ? true : false;
		if (this.bindings) {
			for (const k in this.bindings) {
				const v = this.bindings[k];
				// If we find a defined binding that has no corresponding
				// slot, then we need to derive a new scope.
				if (v !== undefined || !scope.slots[k]) {
					should_derive = true;
					break;
				}
			}
		}
		const effect_scope = should_derive
			? scope.derive(this.bindings)
			: scope;
		const effect = new (this.selector?.isMany
			? MappingSlotEffect
			: SingleSlotEffect)(this, node, effect_scope, this.template).init();

		return this.templateType === "sel"
			? new DynamicTemplateEffect(
					this,
					node,
					effect_scope,
					this.templateName,
					effect,
				).init()
			: effect;
	}
}

// FIXME: Should probably be a subclass of SingleSlotEffect

// --
// This wraps another effect and changes the template.
class DynamicTemplateEffect extends Effect {
	constructor(effector, node, scope, templateSelector, effect) {
		super(effector, node, scope, templateSelector);
		templateSelector instanceof Selector ||
			onError(
				"DynamicTemplateEffect: template selector is not a Selector instance",
				{ templateSelector, effector, node, scope },
			);
		this.effect = effect;
	}

	resolveTemplate(template) {
		const res = template
			? typeof template === "string"
				? Templates.get(template)
				: template instanceof Effector
					? template
					: null
			: null;
		res ||
			onError(
				`DynamicTemplateEffect: unable to resolve template '${template}'`,
				{ template },
			);
		return res;
	}

	apply() {
		return this.unify(this.resolveTemplate(this.scope.eval(this.selector)));
	}

	unify(current, previous = this.value) {
		if (current !== previous) {
			if (this.selector.target) {
				this.scope.set(this.selector.target, current);
			}
			this.value = current;
			// The template has changed
			this.effect.dispose();
			// We only apply the effect if we have a template
			if (current) {
				this.effect.template = current;
				this.effect.bind();
				this.effect.apply();
				if (this.mounted) {
					this.effect.mount();
				}
			}
		}
	}
	// NOTE: Same as SingleSlotEffect
	mount(...args) {
		this.effect?.mount(...args);
		return super.mount(...args);
	}
	unmount(...args) {
		this.effect.unmount(...args);
		return super.unmount(...args);
	}
	bind(...args) {
		this.effect?.bind(...args);
		return super.bind(...args);
	}
	unbind(...args) {
		this.effect.unbind(...args);
		return super.unbind(...args);
	}
	dispose(...args) {
		this.effect?.dispose(...args);
		this.effect = undefined;
		return super.dispose(...args);
	}
}

// This is the generic, abstract version of a slot effect. This is
// specialized by `SingleSlotEffect` and `MultipleSlotEffect`.
class SlotEffect extends Effect {
	constructor(effector, node, scope, template) {
		super(effector, node, scope);
		this.handlers = {};
		this.template = template;
		// FIXME: This is redundant with the Slot.apply(), and should
		// should probably be reviewed/reworked.
		if (this.effector.bindings) {
			this.scope.define(this.effector.bindings, true);
		}
		// We do t he same for the template, but only in case it's
		// undefined.
		if (template && template.bindings) {
			// And the templates complement it
			this.scope.defaults(template.bindings);
		}
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
				`_|SingleSlotEffect`,
			);
			DOM.after(this.node, node);

			// TODO: We should only derive a scope if we have bindings there
			// if (this.effector.bindings) {
			//   scope.updateLocal(this.effector.bindings);
			// }

			// NOTE: No need to call .init(), it's done by apply.
			if (!this.template) {
				return null;
			} else {
				this.effect = this.template.apply(
					node, // node
					this.scope,
				);
				this.mounted && this.effect.mount();
				return this.effect;
			}
		} else if (current !== previous) {
			this.effect.unify(current, previous);
		}
	}
	mount(...args) {
		this.effect?.mount(...args);
		return super.mount(...args);
	}
	unmount(...args) {
		this.effect?.unmount(...args);
		return super.unmount(...args);
	}
	bind(...args) {
		// The effect may have already been bound during initial render
		this.effect && !this.effect.bound && this.effect.bind(...args);
		return super.bind(...args);
	}
	unbind(...args) {
		this.effect?.unbind(...args);
		return super.unbind(...args);
	}
	dispose(...args) {
		const res = super.dispose(...args);
		this.effect?.dispose(...args);
		this.effect = undefined;
		return res;
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
	//

	unify(current, previous = this.value) {
		// We prepare from comparing the current state with the previous state,
		// and do the corresponding operations to unify.
		const { node, scope } = this;
		const isCurrentEmpty = isEmpty(current);
		const isPreviousEmpty = isEmpty(previous);
		const isCurrentAtom = isAtom(current);

		const { target, path } = this.effector.selector;
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
			this.value = current;
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
					const new_item = this.createItem(
						this.template,
						node, // node
						// FIXME: Should we set the key to null?
						scope.derive({ [target || "_"]: current }, path), // scope
						true, // isEmpty
					);
					items.set(null, new_item);
					this.mounted && new_item.mount();
				}
			}
			this.value = current;
		} else if (current instanceof Array) {
			// ### Case: Array
			const items = this.items ? this.items : (this.items = new Map());
			for (let i = 0; i < current.length; i++) {
				const item = items.get(i);
				if (!item) {
					const subscope = scope.derive(
						{ [target || "_"]: current[i] },
						[...path, i],
						i,
					);
					const new_item = this.createItem(
						this.template,
						node, // node
						subscope,
						undefined,
						i,
					);
					items.set(i, new_item);
					this.mounted && new_item.mount();
				} else {
					if (!previous || current[i] !== previous[i]) {
						// NOTE: It's not clear if we need to call apply() on the item.
						// Updating the scope will likely trigger and update of the item.
						// This is not a problem, but it means we may be executing the
						// update twice.
						item.scope.update(target || "_", current[i]);
						// NOTE: I don't think that apply is useful here as
						// the selectors should update when a dependency changes
						// item.apply();
					} else {
						// No change in item
					}
				}
			}
			// // We cleanup any item that is not used anymore
			// let j = current.length;
			// let item = null;
			// while ((item = items.get(j))) {
			// 	item.mounted && item.unmount();
			// 	item.dispose();
			// 	items.delete(j);
			// 	j++;
			// }
			// //this.value = [...current];
			// this.value = current;
		} else {
			// ### Case: Object
			const items = this.items ? this.items : (this.items = new Map());
			for (const k in current) {
				const item = items.get(k);
				if (!item) {
					const subscope = scope.derive(
						{ [target || "_"]: current[k] },
						[...path, k],
						k,
					);
					const new_item = this.createItem(
						this.template,
						node, // node
						subscope,
						undefined,
						k,
					);
					items.set(k, new_item);
					this.mounted && new_item.mount();
				} else {
					if (!previous || current[k] !== previous[k]) {
						item.scope.update(target || "_", current[k]);
						item.apply();
					}
				}
			}
			// const to_dispose = new Set();
			// for (const k of items.keys()) {
			// 	if (current[k] === undefined) {
			// 		const item = items.get(k);
			// 		if (item) {
			// 			item.mounted && item.unmount();
			// 			item.dispose();
			// 		}
			// 		to_dispose.add(k);
			// 	}
			// }
			// for (const k of to_dispose) {
			// 	this.items.delete(k);
			// }
			// //this.value = { ...current };
			// this.value = current;
		}
		// FIXME: By the look of it there's not guarantee the order is preserved,
		// we should make sure that the nodes are mounted in the right
		// order.
		// --
		// This is the cleanup method common to both
		if (!(isCurrentEmpty || isCurrentAtom)) {
			for (const k of [...this.items.keys()]) {
				if (current[k] === undefined) {
					const item = this.items.get(k);
					if (item) {
						item.mounted && item.unmount();
						item.dispose();
					}
					this.items.delete(k);
				}
			}
		}
		// TODO: We could do a copy, but I don't think it's necessary.
		this.value = current;
		return this;
	}

	// -- doc
	// Creates a new item node in which the template can be rendered.
	createItem(template, node, scope, isEmpty = false, key = undefined) {
		// TODO: Should have a better comment
		const root = createComment(
			`out:content=${this.effector.selector.toString()}#${key || 0}`,
		);
		// We need to insert the node before as the template needs a parent
		if (!node.parentNode) {
			onError(
				"MappingSlotEffect.createItem: node has no parent element",
				{
					node,
					path: scope.path,
				},
			);
		} else {
			// TODO: Should use DOM.after
			node.parentNode.insertBefore(root, node);
		}
		// NOTE: We don't need to call init, it's done by apply
		return template
			? template.apply(
					root, // node
					scope,
				)
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
	bind(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				// Item may have been bound during first render
				item && !item.bound && item.bind();
			}
		}
		return super.bind(...args);
	}
	unbind(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				item?.unbind();
			}
		}
		return super.unbind(...args);
	}
	dispose(...args) {
		if (this.items) {
			for (const item of this.items.values()) {
				item?.dispose();
			}
			this.items.clear();
		}
		return super.dispose(...args);
	}
}

// EOF
