import Options from "./utils/options.js";
import { onError } from "./utils/logging.js";
import { onSlotNode } from "./templates/slot.js";
import { onTemplateNode } from "./templates/template.js";
import { onWhenAttribute } from "./templates/when.js";
import { onDoAttribute } from "./templates/do.js";
import { onOutAttribute } from "./templates/inout.js";
import { onOnAttribute } from "./templates/on.js";

export const Templates = new Map();

const TemplateProcessor = {
  do: onDoAttribute,
  slot: onSlotNode,
  out: onOutAttribute,
  on: onOnAttribute,
  when: onWhenAttribute,
  register: (t, name, templates = Templates) => {
    if (name) {
      if (templates.has(name)) {
        if (!Options.allowDuplicateTemplates) {
          onError(
            "templates.createTemplate: Registering template that already exists",
            { name }
          );
        }
        return templates.get(name, t);
      } else {
        templates.set(name, t);
      }
    }
    return t;
  },
};

// --
// ## Templates
//
// This defines how HTML/XML template definitions are translated into
// a tree of effectors.
export const createTemplate = (
  node,
  name = node.getAttribute("name") || node.getAttribute("id"),
  clone = true, // TODO: We should probably always have that to false
  scriptContainer = document.body,
  templates = Templates
) => {
  return onTemplateNode(TemplateProcessor, node, name, clone, scriptContainer);
};

// EOF
