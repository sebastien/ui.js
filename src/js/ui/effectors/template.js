import Options from "../utils/options.js";
import { onError, onWarning } from "../utils/logging.js";
import { assign } from "../utils/collections.js";
import { Effect, Effector } from "../effectors.js";
import { CurrentValueSelector } from "../selector.js";
import { pathNode } from "../path.js";
import { DOM } from "../utils/dom.js";
import { makeKey } from "../utils/ids.js";

export class TemplateEffector extends Effector {
  // -- doc
  // Counts the number of template effectors created, this is the used
  // to assign the `data-scope` attribute.
  static Counter = 0;

  constructor(template, rootName = undefined) {
    // TODO: We may want path a different selector there.
    super(null, CurrentValueSelector);
    this.template = template;
    this.name = template.name;
    this.rootName = rootName;
  }

  apply(node, scope, attributes) {
    // TODO: We should probably create a new scope?
    return new TemplateEffect(this, node, scope, attributes).init();
  }
}

class TemplateEffect extends Effect {
  // We keep a global map of all the template effector states, it's like
  // the list of all components that were created.
  constructor(effector, node, scope, attributes) {
    super(effector, node, scope);
    // The id of a template is expected to be its local path root.
    this.id = makeKey(effector.name);
    // Attributes can be passed and will be added to each view node. Typically
    // these would be class attributes from a top-level component instance.
    this.attributes = attributes;
    this.views = [];
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
          const refs = {};
          for (const [k, p] of view.refs.entries()) {
            const n = pathNode(p, root);
            assign(refs, k, n);
            this.scope.state.put([...this.scope.localPath, `#${k}`], n);
          }

          // --
          // ### Mounting
          //
          // We do need to mount the node first, as the effectors may need
          // the nodes to have a parent. This mounts the view on the parent.

          DOM.after(i === 0 ? this.node : this.views[i - 1].root, root);
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
                onError("Effector does not have a node", { node, i, effector });
              // DEBUG: This is a good place to see
              Options.debug &&
                console.group(
                  `[${this.id}] Template.view.${i}: Applying effector ${
                    Object.getPrototypeOf(effector).constructor.name
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
          // SEE: Comment in the else branch
          // for (const state of this.views[i].states) {
          //   state.apply(this.scope.value);
          // }
        }
      }
      this.mount();
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

  mount() {
    super.mount();
    const n = this.views.length;
    let previous = this.node;
    for (let i = 0; i < n; i++) {
      const node = this.views[i].root;
      if (node) {
        DOM.after(previous, node);
        previous = node;
      }
    }
    this.scope.trigger("Mount", this.scope, this.node);
  }

  unmount() {
    for (const view of this.views) {
      view.root?.parentNode?.removeChild(view.root);
    }
    this.scope.trigger("Unmount", this.scope, this.node);
  }

  dispose() {
    super.dispose();
    for (const view of this.views) {
      for (const state of view.states) {
        state?.dispose();
      }
    }
    this.views = [];

    // FIXME: Broadcast the unmount
    // this.scope.state.bus.pub(
    //   [this.effector.template.name, "Unmount"],
    //   this.scope.state.bus.pub([...this.scope.localPath, "Unmount"], {
    //     scope: this.scope,
    //   })
    // );
  }
}

// EOF
