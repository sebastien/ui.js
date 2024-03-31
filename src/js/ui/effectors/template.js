import Options from "../utils/options.js";
import { onError, onWarning } from "../utils/logging.js";
import { len, assign, reduce } from "../utils/collections.js";
import { Value, Selected, Signal } from "../reactive.js";
import { Effect, Effector } from "../effectors.js";
import { Reactor, Fused } from "../selector.js";
import { pathNode } from "../path.js";
import { DOM } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";
import { Controllers, createController } from "../controllers.js";

export class TemplateEffector extends Effector {
	// -- doc
	// Counts the number of template effectors created, this is the used
	// to assign the `data-scope` attribute.
	static Counter = 0;

	constructor(template, bindings, rootName = undefined, isComponent = false) {
		// TODO: We may want path a different selector there.
		super(null, null);
		this.template = template;
		this.bindings = bindings;
		this.name = template.name;
		this.rootName = rootName;
		// This will be used to test if we need to generate Mount/Unmount events.
		this.isComponent = isComponent;
		this.controller = undefined;
	}
	apply(node, scope, attributes, cells) {
		// If there's a controller attached to the template, we retrieve it.
		// We don't do it earlier so that we leave a chance for the controller
		// to be found.
		if (this.isComponent && this.controller === undefined) {
			this.controller = Controllers.has(this.isComponent)
				? Controllers.get(this.isComponent)
				: null;
			// TODO: We should probably issue a warning if we get `null`, as its
			// means the controller is not yet available.
		}
		// When the template is applied, it may come with default bindings
		// that override the parent context binding. The slots here define
		// these values.
		const reactors = [];
		const slots = reduce(
			this.bindings.handlers,
			(r, v, k) => {
				if (v instanceof Reactor) {
					// We have a reactor, so that means that's an event handler.
					reactors.push(v);
					// If there's no cell to subscribe to in the new slots
					// or in the parent scope, then we create a signal.
					if (r[k] === undefined && scope.slots[k] === undefined) {
						r[k] = new Signal(k);
					}
				}
				return r;
			},
			reduce(
				// The bindings here are defined at the template level.
				this.bindings.slots,
				(r, v, k) => {
					const parent_cell = scope.slots[k];
					if (v instanceof Fused) {
						// FIXME: If we have a selector in an `inout` parent_cell, we may get
						// two different behaviour when the parent_cell is defined and when
						// it's not.
						r[k] = parent_cell ? parent_cell : v.selector;
					} else {
						// Here we only add to  slot if there is no parent parent_cell
						// in the scope, or if the parent_cell is a value with no value
						// just yet.
						if (
							!parent_cell ||
							(v !== undefined &&
								parent_cell instanceof Value &&
								parent_cell.revision === -1)
						) {
							r[k] = v;
						}
					}
					return r;
				},
				{}
			)
		);

		const subscope =
			this.isComponent || len(slots) > 0 ? scope.derive(slots) : scope;
		// FIXME: Same as effector/slot
		const subscriptions =
			reactors.length > 0
				? reactors.reduce((r, { name, selector }) => {
						if (!selector) {
							return r;
						}
						const s = subscope.slots[name].sub(() => {
							const v = subscope.eval(selector, true);
							if (selector.target) {
								// NOTE: We use update here as we don't
								// want to create a new slot.
								subscope.update(selector.target, v);
							}
							return v;
						});
						s.enable(false);
						if (r === null) {
							return [s];
						} else {
							r.push(s);
							return r;
						}
				  }, null)
				: null;
		// We do need to make sure that any derived value is evaluated at this
		// stage. This is is a bit of a tax to pay.
		for (const k in this.bindings.slots) {
			const slot = subscope.slots[k];
			if (slot.revision === -1 && slot instanceof Selected) {
				// This forces an evaluation of the slot.
				slot.value;
			}
		}
		if (this.isComponent && subscope !== scope) {
			subscope.isComponentBoundary =
				this.name || this.template.name || true;
		}
		// NOTE: There's a question where we should call init()
		return new TemplateEffect(
			this,
			node,
			subscope,
			attributes,
			subscriptions
		).init();
	}
}

class TemplateEffect extends Effect {
	// We keep a global map of all the template effector states, it's like
	// the list of all components that were created.
	constructor(effector, node, scope, attributes, subscriptions) {
		super(effector, node, scope);
		// The id of a template is expected to be its local path root.
		this.id = makeKey(effector.name);
		// Attributes can be passed and will be added to each view node. Typically
		// these would be class attributes from a top-level component instance.
		this.attributes = attributes;
		this.subscriptions = subscriptions;
		this.views = [];
		// FIXME: We should make this lazy (ie only create on bind)
		this.controller = this.effector.controller
			? createController(this.effector.controller, this.scope)
			: null;
	}

	unify() {
		const template = this.effector.template;
		// This should really be called only once, when the template is expanded.
		if (this.views.length != template.views.length) {
			// Creates nodes and corresponding effector states for each template
			// views.
			while (this.views.length < template.views.length) {
				this.views.push(undefined);
			}
			// Now for each view…
			for (let i = 0; i < template.views.length; i++) {
				// … we create the view if it does not exist
				if (!this.views[i]) {
					// FIXME: This should be using the View Effector.
					// We start with cloning the view root node.
					const view = template.views[i];
					const root = view.root.cloneNode(true);
					// And getting a list of the root node for each effector.
					const nodes = view.effectors.map((_, i) => {
						const n = pathNode(_.nodePath, root);
						if (!n) {
							onWarning(
								`Effector #${i} cannot resolve the following path from the root`,
								{ path: _.nodePath, root }
							);
						}
						return n;
					});

					// We update the `data-template` and `data-path` attributes, which is
					// used by `EventEffectors` in particular to find the scope.
					if (root.nodeType === Node.ELEMENT_NODE) {
						// If the effect has attributes registered, we defined them.
						if (this.attributes) {
							for (const [k, v] of this.attributes.entries()) {
								if (k === "class") {
									const w = root.getAttribute("class");
									root.setAttribute(k, w ? `${w} ${v}` : v);
								} else if (!root.hasAttribute(k)) {
									root.setAttribute(k, v);
								}
							}
						}
						// TODO: Re-enable that when we do SSR
						// We update the node dataset
						// root.dataset["template"] =
						//   this.effector.rootName || this.effector.name;
						// root.dataset["path"] = this.scope.path
						//   ? this.scope.path.join(".")
						//   : "";
						// root.dataset["id"] = this.id;
					}

					// --
					// ### Refs
					//
					// We extract refs from the view and register them as corresponding
					// entries in the local state. We need to do this first, as effectors
					// may use specific refs.
					// FIXME: Do we really need to pass the `refs`?
					//
					// TODO: We should support an array of refs, like the children of a list
					const refs = {};
					for (const [k, p] of view.refs.entries()) {
						const n = pathNode(p, root);
						assign(refs, k, n);
						this.scope.set(
							k,
							n,
							/* force to override */ true,
							false
						);
					}

					// --
					// ### Mounting
					//
					// We do need to mount the node first, as the effectors may need
					// the nodes to have a parent. This mounts the view on the parent.

					DOM.after(
						i === 0 ? this.node : this.views[i - 1].root,
						root
					);
					if (!root.parentNode) {
						onError(
							"TemplateEffect: view root node should always have a parent",
							{ i, root, view }
						);
					}

					// We add the view, which will be collected in the template effector.
					this.views[i] = {
						root,
						refs,
						nodes,
						states: view.effectors.map((effector, i) => {
							const node = nodes[i];
							!node &&
								onError("Effector does not have a node", {
									node,
									i,
									effector,
								});
							// DEBUG: This is a good place to see
							Options.debug &&
								console.group(
									`[${
										this.id
									}] Template.view.${i}: Applying effector ${
										Object.getPrototypeOf(effector)
											.constructor.name
									} on node`,
									node,
									{
										effector,
										root,
										refs,
									}
								);
							const res = effector.apply(node, this.scope);
							Options.debug && console.groupEnd();
							return res;
						}),
					};
				} else {
					// SEE: Commenting out the else branch
					// for (const state of this.views[i].states) {
					//   state.apply(this.scope.value);
					// }
				}
			}
		} else {
			// NOTE: I'm not sure if we need to forward the changes downstream,
			// I would assume that the subscription system would take care of
			// detecting and relaying changes.
			/// for (const view of this.views) {
			///   for (const state of view.states) {
			///     state.apply(this.scope.value);
			///   }
			/// }
		}
	}

	// TODO: What is this used for?
	query(query) {
		const res = [];
		for (let view of this.views) {
			const root = view.root;
			if (root.matches && root.matches(query)) {
				res.push(root);
			}
			if (root?.querySelectorAll) {
				for (const node of root.querySelectorAll(query)) {
					res.push(node);
				}
			}
		}
		return res;
	}

	bind() {
		if (this.effector.controller) {
			if (!this.controller) {
				this.controller = createController(
					this.effector.controller,
					this.scope,
					this.node
				);
			}
			for (const [name, handlers] of this.controller.events.entries()) {
				for (const h of handlers) {
					this.scope.bindEvent(name, h);
				}
			}
		}
		if (this.subscriptions) {
			for (const sub of this.subscriptions) {
				sub.enable();
			}
		}
		// TODO: Should we trigger a bind event?
		return super.bind();
	}

	unbind() {
		if (this.subscriptions) {
			for (const sub of this.subscriptions) {
				sub.disable();
			}
		}
		if (this.controller) {
			// TODO: Should we trigger unbind?
			for (const [name, handlers] of this.controller.events.entries()) {
				for (const h of handlers) {
					this.scope.unbindEvent(name, h);
				}
			}
		}
		return super.unbind();
	}

	mount() {
		const res = super.mount();
		// NOTE: In practice, templates DOM nodes will already be mounted, as the
		// unify() process requires that. however, what's important here is to
		// call mount on the effectors.
		let previous = this.node;
		if (!this.node || !this.node.parentNode) {
			// This may happen if the parent is not mounted, in this case
			// we unmount and will remount when the parent is mounted.
			return this.unmount();
		}
		for (const view of this.views) {
			const { root, states } = view;
			if (root) {
				DOM.after(previous, root);
				previous = root;
			}
			for (const state of states) {
				state?.mount();
			}
		}
		this.effector.isComponent &&
			this.scope.triggerEvent(
				"mount",
				undefined,
				this.scope,
				this.node,
				false
			);
		return res;
	}

	unmount() {
		for (const view of this.views) {
			const { root, states } = view;
			for (const state of states) {
				// NOTE: Unmount may have been triggered more than once due
				// to unmount on mount when no parent.
				if (state && state.mounted) {
					state?.unmount();
				}
			}
			root?.parentNode?.removeChild(view.root);
		}
		this.effector.isComponent &&
			this.scope.triggerEvent(
				"unmount",
				undefined,
				this.scope,
				this.node,
				false
			);
		return this.mounted ? super.unmount() : this;
	}

	dispose() {
		const res = super.dispose();
		for (const view of this.views) {
			for (const state of view.states) {
				state?.dispose();
			}
			// FIXME: Not clear why this is not already done.
			view.root?.parentNode?.removeChild(view.root);
		}
		this.views = [];

		// FIXME: Broadcast the unmount
		// this.scope.state.bus.pub(
		//   [this.effector.template.name, "Unmount"],
		//   this.scope.state.bus.pub([...this.scope.localPath, "Unmount"], {
		//     scope: this.scope,
		//   })
		// );
		return res;
	}
}

// EOF
