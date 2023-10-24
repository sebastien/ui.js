import Options from "./utils/options.js";
import { onError } from "./utils/logging.js";
import { onSlotNode } from "./templates/slot.js";
import { onTemplateNode } from "./templates/template.js";
import { onWhenAttribute } from "./templates/when.js";
import { onDoAttribute } from "./templates/do.js";
import { onOutAttribute } from "./templates/inout.js";
import { onForAttribute } from "./templates/for.js";
import { onOnAttribute } from "./templates/on.js";

export const Templates = new Map();

class TemplateProcessor {
  constructor(templates = Templates, name) {
    this.Dor = onDoAttribute;
    this.Slot = onSlotNode;
    this.Out = onOutAttribute;
    this.On = onOnAttribute;
    this.When = onWhenAttribute;
    this.For = onForAttribute;
    this.templates = templates;
    this.name;
  }
  register(name, t, templates = this.templates) {
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
  }
}

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
  return onTemplateNode(
    new TemplateProcessor(templates, name),
    node,
    name,
    clone,
    scriptContainer
  );
};

// EOF
