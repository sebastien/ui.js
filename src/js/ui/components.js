import { Templates } from "./templates.js";
import { EffectScope } from "./effectors.js";
import { createComment, onError, makeKey } from "./utils.js";
import { Controllers, createController } from "./controllers.js";

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
    state,
    path,
    slots,
    attributes
  ) {
    this.id = id;
    this.anchor = anchor;
    this.template = template;
    this.state = state;
    this.scope = new EffectScope(
      state,
      path,
      ["@components", template.name, id],
      slots
    );
    // this.scope = new EffectScope(
    //   state,
    //   path || localPath,
    //   localPath,
    //   state.get(path || localPath),
    //   state.get(localPath)
    // );
    this.controller = controller
      ? createController(controller, this.scope)
      : null;
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
export const createComponent = (
  node,
  state,
  templates = Templates,
  controllers = Controllers
) => {
  // --
  // We retrieve the following attributes:
  // - `data-ui`
  // - `data-path`
  const { ui, path, id } = node.dataset;

  // --
  // We validate that the template exists.
  const template = templates.get(ui);
  if (!template) {
    onError(
      `ui.render: Could not find template '${ui}', available templates are ${[
        ...templates.keys(),
      ].join(", ")}`,
      {
        node,
        ui,
        templates,
      }
    );
    return null;
  }

  // We create an anchor component, and replace the node with the anchor.
  const key = id ? id : makeKey(ui);

  const anchor = createComment(`${key}|Component|${ui}`);
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
    controllers.get(ui),
    state,
    path ? path.split(".") : undefined,
    extractSlots(node),
    attributes
  );
};

// EOF
