import { Templates } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { onError, makeKey } from "./utils.js";

// --
// The `Component` class encapsulates an anchor node, a template effector,
// and state context
export class Component {
  constructor(id, anchor, template, context, path, slots) {
    this.id = id;
    this.anchor = anchor;
    this.template = template;
    this.context = context;
    const localPath = ["@local", this.id];
    if (slots) {
      context.state.patch(localPath, slots);
    }
    this.scope = new EffectScope(
      context.state,
      path || localPath,
      localPath,
      context.state.get(path || localPath),
      context.state.get(localPath),
      context.events
    );
    this.effect = template.apply(this.anchor, this.scope);
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
// Takes a DOM node that typically has `data-ui` attribute and looks
// by applying a template.
export const createComponent = (node, context, templates = Templates) => {
  // --
  // We retrieve the following attributes:
  // - `data-ui`
  // - `data-path`
  const { ui, path } = node.dataset;

  // --
  // We validate that the template exists.
  const template = templates.get(ui);
  if (!template) {
    onError(`ui.render: Could not find template '${ui}'`, {
      node,
      ui,
    });
    return null;
  }

  // We create an anchor component, and replace the node with the anchor.
  const id = makeKey();
  const anchor = document.createComment(`⚓ ${ui}:${id}`);
  node.parentElement.replaceChild(anchor, node);

  return new Component(id, anchor, template, context, path, extractSlots(node));
};

// EOF
