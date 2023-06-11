import { parsePath, pathNode } from "./paths.js";
import { CurrentValueSelector } from "./selector.js";
import {
  Options,
  Empty,
  isAtom,
  isEmpty,
  onError,
  makeKey,
  assign,
  access,
} from "./utils.js";
import { Templates } from "./templates.js";

class DOM {
  static after(previous, node) {
    switch (previous.nextSibling) {
      case null:
        previous.parentNode && previous.parentNode.appendChild(node);
        return;
      case node:
        return;
      default:
        previous.parentNode &&
          previous.parentNode.insertBefore(node, previous.nextSibling);
    }
  }
  static mount(parent, node) {
    switch (parent.nodeType) {
      case Node.ELEMENT_NODE:
        node.parentNode !== parent && parent.appendChild(node);
        break;
      default:
        // TODO: Should really be DOM.after, but it breaks the effectors test
        DOM.after(parent, node);
    }
  }
  static unmount(node) {
    node.parentNode?.removeChild(node);
    return node;
  }
}
// --
// ## Effectors
//
//

// -- doc

export class EffectScope {
  constructor(state, path, localPath, slots, key) {
    this.state = state;
    this.path = path;
    this.localPath = localPath;
    this.key = key;
    this.slots = slots;
    this.handlers = new Map();
  }

  get value() {
    return this.state.get(this.path);
  }

  resolve(path) {
    return path
      ? path.at(-1) === "#"
        ? this.key
        : access(this.value, path)
      : this.value;
  }

  derive(path, localPath = this.localPath, slots = this.slots, key = this.key) {
    return new EffectScope(
      this.state,
      [...this.path, ...(typeof path === "string" ? path.split(".") : path)],
      localPath,
      slots,
      key
    );
  }

  set(name, value) {}

  get(name) {}

  trigger(name, ...args) {
    const handlers = this.handlers.get(name);
    handlers &&
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (exception) {
          onError(`${name}: Handler failed`, { handler, exception, args });
        }
      });
  }
}

// --
// ## Effect
//
// Implements the base class of an effect.
class Effect {
  constructor(effector, node, scope) {
    this.effector = effector;
    this.node = node;
    this.scope = scope;
    this.value = undefined;

    // We perform some checks
    !node && onError("Effect(): effector should have a node", { node });
    !effector.selector &&
      onError("Effect(): effector should have a selector", { effector });

    // FIXME: Disabling this as well
    // this.selected = effector.selector.apply(scope, this.onChange.bind(this));

    // FIXME: Disabling this one
    // this.abspath = this.selected.abspath;
  }

  bind() {
    // FIXME: Disabled
    // this.selected.bind(this.scope);
    return this;
  }

  unbind() {
    // FIXME: Disabled
    // this.selected.unbind(this.scope);
    return this;
  }

  init() {
    this.apply();
    this.bind();
    return this;
  }

  apply() {
    const value = this.effector.selector.extract(
      this.scope.value,
      this.scope.key
    );
    return this.unify(value, this.value);
  }

  unify(current, previous = this.value) {
    onError("Effect.unify not implemented", {
      this: this,
      parent: Object.getPrototypeOf(this),
    });
  }

  mount() {}
  unmount() {}

  dispose() {
    this.unmount();
    this.unbind();
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
    this.selector = selector;
    if (!selector) {
      onError("Effector(): Effector has no selector defined", {
        selector,
        nodePath,
      });
    }
  }

  // --
  // An effector is applied when the effect need to be instanciated
  apply(node, scope) {
    onError("Effector.apply: no implementation defined", {
      node,
      scope,
    });
  }
}

// --
// ## Content Effector
//
// Content effectors replace the content of a given node.

export class ContentEffector extends Effector {
  constructor(nodePath, selector, placeholder) {
    super(nodePath, selector);
    this.placeholder = placeholder;
  }
  apply(node, scope) {
    return new ContentEffect(this, node, scope).init();
  }
}

class ContentEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.textNode = document.createTextNode("");
    this.contentNode = undefined;
    this._placeholder = undefined;
  }

  // --
  // Lazily clones the palceholder, if it is defined.
  get placeholder() {
    const fragment = this.effector.placeholder;
    if (fragment && !this._placeholder) {
      const placeholder = [];
      for (let i = 0; i < fragment.childNodes.length; i++) {
        placeholder.push(fragment.childNodes[i].cloneNode(true));
      }
      this._placeholder = placeholder;
    }
    return this._placeholder;
  }

  unify(value, previous = this.value) {
    const placeholder = this.placeholder;
    const isEmpty = value === Empty || value === null || value === undefined;
    if (isEmpty) {
      this.textNode.data = "";
    } else if (value instanceof Node) {
      if (
        this.contentNode &&
        value !== this.contentNode &&
        this.contentNode.parentElement
      ) {
        this.contentNode.parentElement.replaceChild(value, this.contentNode);
      }
      this.contentNode = value;
      this.textNode.data = "";
    } else {
      this.contentNode = undefined;
      this.textNode.data =
        value === Empty || value === null || value === undefined
          ? ""
          : typeof value === "string"
          ? value
          : `${value}`;
    }

    if (!this.textNode.parentNode) {
      DOM.mount(this.node, this.textNode);
    }
    if (this.contentNode && !this.contentNode.parentNode) {
      DOM.mount(this.node, this.contentNode);
    }

    // We mount/unmount the placeholder, if there's one.
    if (placeholder)
      if (isEmpty) {
        let previous = this.textNode;
        for (const node of placeholder) {
          DOM.after(previous, node);
          previous = node;
        }
      } else {
        for (const node of placeholder) {
          DOM.unmount(node);
        }
      }
    return this;
  }

  unmount() {
    // TODO: Should use DOM.mount
    DOM.unmount(this.textNode);
  }
}

// --
// ## Attribute Effector

class AttributeEffect extends Effect {
  unify(value, previous = this.value) {
    if (value === Empty || value == undefined || value === null) {
      this.node.removeAttribute(this.effector.name);
    } else {
      this.node.setAttribute(this.effector.name, value);
    }
    return this;
  }
}

export class AttributeEffector extends Effector {
  constructor(nodePath, selector, name) {
    super(nodePath, selector);
    this.name = name;
  }

  apply(node, scope) {
    return new AttributeEffect(this, node, scope).init();
  }
}

// --
// ## Value Effector
//

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

// --
// ## Style Effector
//
class StyleEffect extends Effect {
  unify(value, previous = this.value) {
    // FIXME: Not sure it should be assign... should probably set the whole thing and remove the ones not set
    value === Empty
      ? (this.node.style = null)
      : Object.assign(this.node.style(value));
    return this;
  }
}
export class StyleEffector extends AttributeEffector {
  apply(node, scope) {
    return new StyleEffect(this, node, scope).init();
  }
}

//  --
// ## Event Effector
//

export class EventEffector extends Effector {
  // -- doc
  // Creates a new `EventEffector` that  is triggered by the given `event`,
  // generating an event `triggers` (when defined), or
  constructor(nodePath, event, directive) {
    super(nodePath, CurrentValueSelector);
    this.directive = directive;
    this.eventPath = directive.event ? directive.event.split(".") : null;
    this.event = event;
  }

  apply(node, scope) {
    return new EventEffect(this, node, scope);
  }
}

class EventEffect extends Effect {
  static Value(event) {
    // TODO: Should automatically extract data
    return event.target.value;
  }
  // -- doc
  // Finds the first ancestor node that has a path.
  static FindScope(node) {
    while (node) {
      let { template, path, id } = node.dataset;
      if (template && path !== undefined) {
        return { template, path: parsePath(path), id };
      }
      node = node.parentElement;
    }
    return [null, null];
  }
  constructor(effector, node, scope) {
    super(effector, node, scope);
    const { events, inputs, stops } = this.effector.directive;
    this.handler = (event) => {
      if (inputs) {
        const delta = inputs.reduce((r, input) => {
          r[input.key] = input.apply(event);
          return r;
        }, {});
        console.log("EVENT:FIXME:Delta", { delta });
      }
      if (events) {
        const value = EventEffect.Value(event);
        for (const name of events) {
          scope.trigger(name, event, scope, value);
        }
      }
      if (stops) {
        event.preventDefault();
        event.stopPropagation();
      }
      // // If there is a path then we update this based on the value
      // if (destination) {
      //   switch (destination.type) {
      //     case "":
      //       this.scope.patch(destination.path, value);
      //       break;
      //     case ".":
      //       this.scope.patch([...this.scope.path, ...destination.path], value);
      //       break;
      //     default:
      //       onError("effectors.EventEffect: Selector type not supported yet", {
      //         destination,
      //       });
      //       break;
      //   }
      // }
      // if (eventPath) {
      //   // FIXME: We should probably be able to know the template name from
      //   // the scope.
      //   const { template } = EventEffect.FindScope(event.target);
      //   const data = {
      //     name: eventPath.join(""),
      //     event,
      //     scope,
      //   };
      //   // This is a relative event, which then may have local registered handlers
      //   if (eventPath[0] == "") {
      //     this.scope.state.put(
      //       [...scope.localPath, ...eventPath.slice(1)],
      //       data
      //     );
      //   } else {
      //     // TODO: Arguably, we could be using the state tree with events to publish that
      //     // FIXME: If we have a separate bus, we need to explain why in the design.
      //     console.log("TODO: PUBLISH EVENT DISPATCHING", {
      //       template,
      //       eventPath,
      //       data,
      //     });
      //   } }
    };
    node.addEventListener(this.effector.event, this.handler);
  }

  unify(current, previous = this.value) {
    if (current !== previous) {
      console.log("TODO: Event effector unify", { current, previous });
    }
  }

  dispose() {
    this.node.removeEventListener(this.effector.event, this.handler);
  }
}

// --
// ## Slot Effector

// NOTE: I think the only thing that a slot effector has to do is
// to detect add remove and relay these.
export class SlotEffector extends Effector {
  constructor(nodePath, selector, templateName, handlers) {
    super(nodePath, selector);
    // TODO: Selectors for slots should not have a format, slots pass
    // down the value directly to a template.
    //
    // The handlers map event names to the path at which the incoming
    // events should be stored/relayed.
    this.handlers = handlers;
    this.templateName = templateName;
    if (!templateName) {
      onError(
        `SlotEffector: template is not specified, use ContentEffector instead`,
        { nodePath, selector }
      );
    }
    this._template =
      typeof templateName === "string" ? undefined : templateName;
  }

  // -- doc
  // The effector `template` is lazily resolved, as it may not have been
  // defined at time of declaration.
  get template() {
    const res = this._template
      ? this._template
      : (this._template = Templates.get(this.templateName));
    if (!res) {
      onError(`SlotEffector: Could not find template '${this.templateName}'`, [
        ...Templates.keys(),
      ]);
    }
    return res;
  }

  apply(node, scope) {
    // FIXME
    // // We keep track of the parent local path, as the scope may be changed
    // // and we need to be able to relay data/events from one local scope
    // // to the other.
    // const parentLocalPath = scope.localPath;
    // // In the case the effector has a localPath, we derive the scope and
    // // change the local path. This allows to create a new context in which
    // // the effector state is stored.
    // if (this.localPath) {
    //   scope = scope.copy();
    //   scope.localPath = composePaths(scope.localPath, this.localPath);
    // }
    return new (this.selector.isMany ? MappingSlotEffect : SingleSlotEffect)(
      this,
      node,
      scope
    ).init();
  }
}

// This is the generic, abstract version of a slot effect. This is
// specialized by `SingleSlotEffect` and `MultipleSlotEffect`.
class SlotEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.handlers = {};
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
  }
  unbind() {
    const res = super.unbind();
    const scope = this.scope;
    // FIXME: Implement this back
    // for (const k in this.handlers) {
    //   const p = [...scope.localPath, k];
    //   scope.state.sub(p, this.handlers[k]);
    // }
    return res;
  }
}
class SingleSlotEffect extends SlotEffect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    this.view = undefined;
  }

  unify(current, previous = this.value) {
    if (!this.view) {
      const scope = this.scope;
      const node = document.createComment(
        // FIXME: add a better description of that part
        `_|SingleSlotEffect`
      );
      DOM.after(this.node, node);
      this.view = this.effector.template
        ?.apply(
          node, // node
          scope
        )
        ?.init();
      return this.view;
    } else if (current !== previous) {
      this.view.unify(current, previous);
    }
  }
}

// --
// Implements the mapping of a slot for each item of a collection.
class MappingSlotEffect extends SlotEffect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    // FIXME: This may not be necessary anymore
    // We always go through a change
    // this.selected.alwaysChange = true;
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

    const path = this.effector.selector.path;

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
        } else {
          items.set(
            null,
            this.createItem(
              node, // node
              scope.derive(path), // scope
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
          items.set(
            i,
            this.createItem(
              node, // node
              // FIXME: We probably want to change the local path
              scope.derive([...path, i], scope.localPath, scope.slots, i),
              undefined,
              i
            )
          );
        } else {
          if (!previous || current[i] !== previous[i]) {
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
          items.set(
            k,
            this.createItem(
              node, // node
              // FIXME: We probably want to change the local path
              scope.derive([...path, k], scope.localPath, scope.slots, k),
              undefined,
              k
            )
          );
        } else {
          if (!previous || current[k] !== previous[k]) {
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
  createItem(node, scope, isEmpty = false, key = undefined) {
    // TODO: Should have a better comment
    const root = document.createComment(
      `out:content=${this.effector.selector.toString()}#${key || 0}`
    );
    // We need to insert the node before as the template needs a parent
    if (!node.parentNode) {
      onError("MappingSlotEffect.createItem: node has no parent element", {
        node,
        value: scope.value,
        path: scope.path,
      });
    } else {
      // TODO: Should use DOM.after
      node.parentNode.insertBefore(root, node);
    }
    return this.effector.template.apply(
      root, // node
      scope
    );
  }
}

// --
// ### Conditional Effector

export class WhenEffector extends SlotEffector {
  constructor(nodePath, selector, templateName, predicate) {
    super(nodePath, selector, templateName);
    this.predicate = predicate;
  }

  apply(node, scope) {
    return new WhenEffect(this, node, scope).init();
  }
}

class WhenEffect extends Effect {
  constructor(effector, node, scope) {
    super(effector, node, scope);
    // The anchor will the element where the contents will be re-inserted
    //
    // FIXME: Not sure the anchor is necessary
    // TODO: Should have better names
    this.anchor = document.createComment(`WhenEffect`);
    this.contentAnchor = document.createComment(`WhenEffect:Content`);
    this.displayValue = node?.style?.display;
    this.node.appendChild(this.contentAnchor);
    // FIXME: Not sure why this is necessary. We should not change the node
    // here as it will cause problem in other effeects, as this will in effect
    // replace the root node of the view.
    // this.node.parentNode.replaceChild(this.anchor, node);
    this.state = null;
  }

  unify(value, previous = this.value) {
    if (previous === undefined || value !== previous) {
      this.effector.predicate(value) ? this.show(value) : this.hide();
    }
    this.value = value;
    return this;
  }

  show(value) {
    if (!this.state) {
      this.state = this.effector.template.apply(this.contentAnchor, this.scope);
    } else {
      this.state.unify(value);
      this.state.mount();
    }
    if (this.node.style) {
      this.node.style.display = this.displayValue;
    } else {
      // These may be other kind of nodes, probably not visible (ie, comments)
      onError("WhenEffect.show: Node has no style", {
        node: this.node,
        value,
      });
    }

    if (!this.node.parentNode) {
      DOM.mount(this.anchor, this.node);
    }

    return this;
  }

  hide() {
    if (this.node.style) {
      this.node.style.display = "none";
    } else {
      // These may be other kind of nodes, probably not visible (ie, comments)
    }
    if (this.state) {
      this.state.unmount();
    }
  }
}

// --
// ## Match Effector

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
      if (value === branch.value) {
        index = i;
        break;
      }
    }
    // FIXME: We should check that this works both for regular nodes
    // and slots as well.
    if (this.states[index] === undefined) {
      // We apply the template effector at the match effect node, which
      // should be a comment node.
      this.states[index] = branch.template.apply(this.node, this.scope);
    }
    if (index !== this.currentBranchIndex) {
      this.states[index].init().mount();
      const previousState = this.states[this.currentBranchIndex];
      if (previousState) {
        previousState.unmount();
      }
      this.currentBranchIndex = index;
    }
    return this;
  }
}

// --
// ## Template Effector
//

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
          const nodes = view.effectors.map((_) => pathNode(_.nodePath, root));

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
