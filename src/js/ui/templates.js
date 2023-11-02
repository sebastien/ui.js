import Options from "./utils/options.js";
import { onError } from "./utils/logging.js";
import { onSlotNode } from "./templates/slot.js";
import { onTemplateNode } from "./templates/template.js";
import { onDoAttribute } from "./templates/do.js";
import { onOutAttribute } from "./templates/inout.js";
import { onForAttribute } from "./templates/for.js";
import { onOnAttribute } from "./templates/on.js";
import { onMatchAttribute } from "./templates/match.js";

export const Templates = new Map();

class TemplateProcessor {
  constructor(templates = Templates, name, scripts) {
    this.Dor = onDoAttribute;
    this.Slot = onSlotNode;
    this.Out = onOutAttribute;
    this.On = onOnAttribute;
    this.Match = onMatchAttribute;
    this.For = onForAttribute;
    this.Template = onTemplateNode;
    this.templates = templates;
    this.name = name;
    this.scripts = scripts;
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
    new TemplateProcessor(templates, name, scriptContainer),
    node,
    name,
    clone,
    // FIXME: Should remove this attribute
    scriptContainer
  );
};

// EOF
