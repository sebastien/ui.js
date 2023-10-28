import { Templates } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { createComment } from "./utils/dom.js";
import { onError } from "./utils/logging.js";
import { makeKey } from "./utils/ids.js";
import { getSlotBindings } from "./templates/slot.js";

// ============================================================================
// COMPONENTS
// ============================================================================

// --
//
// ## Components
//
// The `Component` class encapsulates an anchor node, a template effector,
// and state context
export class Component {
  constructor(
    id,
    anchor,
    template,
    controller,
    store,
    path,
    slots,
    attributes
  ) {
    this.id = id;
    this.anchor = anchor;
    this.template = template;
    this.store = store;
    // TODO: We should really initialize a component with "slots" as bindings.
    // Each binding is then mapped into a local component scope. The scope
    // should resolve from cells first, and if not from the store. Effect
    // scope should be from cells.
    // TODO: State really should be store.
    this.scope = new EffectScope(store, path, ["@components", id], slots);
    // this.scope = new EffectScope(
    //   state,
    //   path || localPath,
    //   localPath,
    //   state.get(path || localPath),
    //   state.get(localPath)
    // );
    this.effect = template.apply(this.anchor, this.scope, attributes);
  }
}

// --
// Extracts the `<* slot="SLOT_NAME">…</*>` descendants of the given DOM
// node, and returns them as an object if defined. Otherwise returns null. This
// also removes the nodes as they are added to the object.
const extractSlots = (node) => {
  const slots = {};
  let hasSlots = false;
  for (const _ of node.querySelectorAll("*[slot]")) {
    const n = _.getAttribute("slot") || "children";
    const l = slots[n];
    if (!l) {
      slots[n] = _;
    } else if (l instanceof Array) {
      l.push(_);
    } else {
      slots[n] = [l, _];
    }
    _.parentElement.removeChild(_);
    hasSlots = true;
  }
  return hasSlots ? slots : null;
};

// --
// Takes a DOM node that typically has a `data-ui` attribute, looks for the
// corresponding template in `Templates` and creates a new `Component`
// replacing the given `node` and then rendering the component.
export const createComponent = (node, store, templates = Templates) => {
  const bindings = getSlotBindings(node);
  const templateName = node.getAttribute("template");
  const id = node.getAttribute("id");

  // --
  // We validate that the template exists.
  const template = templates.get(templateName);
  if (!template) {
    onError(
      `ui.render: Could not find template '${templateName}', available templates are ${[
        ...templates.keys(),
      ].join(", ")}`,
      {
        node,
        templateName,
        templates,
      }
    );
    return null;
  }

  // We create an anchor component, and replace the node with the anchor.
  const key = id ? id : makeKey(templateName);
  const anchor = createComment(`${key}|Component|${templateName}`);
  const attributes = [...node.attributes].reduce((r, v) => {
    if (!v.name.startsWith("data-")) {
      r.set(v.name, v.value);
    }
    return r;
  }, new Map());

  // TODO: We should probably move the  node to a fragment an render
  // the fragment separately before mounting it, so that we minimize DOM
  // changes.
  node.parentElement.replaceChild(anchor, node);

  return new Component(
    key,
    anchor,
    template,
    null,
    store,
    // This should be the scope/state path
    undefined,
    extractSlots(node),
    attributes
  );
};

// EOF
