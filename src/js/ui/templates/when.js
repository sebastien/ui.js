import { WhenEffector } from "../effectors/when.js";
import { nodePath } from "../path.js";
import { onError } from "../utils/logging.js";
import { makeKey } from "../utils/ids.js";
import { bool } from "../utils/values.js";
import { parseValue, parseSelector } from "./directives.js";
import { onTemplateNode } from "./template.js";

const Comparators = {
  "=": (a, b) => a == b,
  // TODO: We should probably only accept one?
  "==": (a, b) => a == b,
  "!=": (a, b) => a != b,
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
};

// --
// Parses a `when=TEXT` directive.
export const parseWhenDirective = (text) => {
  const match = text.match(
    /^(?<selector>[^=!<>]+)((?<operator>==?|!=|>|>=|<|<=)(?<value>.+)?)?$/
  );
  if (!match) {
    return null;
  } else {
    const { selector, value, operator } = match.groups;
    const v = value ? parseValue(value) : undefined;
    const f = operator ? Comparators[operator] : bool;
    if (!f) {
      onError(`Could not find comparator for '${operator}'`, {
        directive: text,
        groups: match.groups,
      });
      return null;
    }

    return {
      selector: parseSelector(selector) || null,
      predicate: (_) => f(_, v),
    };
  }
};

export const onWhenAttribute = (processor, node, root, templateName) => {
  // NOTE: Before we had a condition for boundary === root, however I'm
  // not sure why.
  const text = node.getAttribute("when");
  const when = parseWhenDirective(text);
  if (!when) {
    onError(`Could not parse when directive '${text}'`, {
      node,
      when: text,
    });
  } else {
    node.removeAttribute("when");
    const frag = document.createDocumentFragment();
    while (node.childNodes.length > 0) {
      frag.appendChild(node.childNodes[0]);
    }
    // TODO: If there is no sub-effectors, we should not bother
    // with a template, it's a waste of resources.
    // TODO: We may want to register the template in the collection of templates
    const subtemplate = onTemplateNode(
      processor,
      frag,
      makeKey(templateName ? `${templateName}:when=${text}` : `when=${text}`),
      false // No need to clone there
    );
    return new WhenEffector(
      nodePath(node, root),
      when.selector,
      subtemplate,
      when.predicate
    );
  }
};

// EOF
