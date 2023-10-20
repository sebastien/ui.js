import { INPUT, parseInput } from "../selector.js";
import { EventEffector } from "../effectors.js";
import { nodePath } from "../path.js";
import { onError } from "../utils/logging.js";

export const onOnAttribute = (processor, attr, root, name) => {
  const node = attr.ownerElement;
  // NOTE: If the attr has no owner, it has already been proccessed.
  if (!node) {
    return null;
  }
  node.removeAttribute(attr.name);
  // A `<slot out:XXX>` node  may have `on:XXX` attributes as well, in which
  // case they've already been processed at that point.
  if (node && node.parentNode) {
    const directive = parseOnDirective(attr.value);
    if (!directive) {
      return onError(
        `templates.view: Could not parse on 'on:*' directive '${attr.value}'`,
        {
          name,
          attr,
          root,
        }
      );
    } else {
      return new EventEffector(nodePath(node, root), name, directive);
    }
  }
  return null;
};

//
// --
// ### Handling events: `on:EVENT=DIRECTIVE`.
//
// The `on:EVENT=DIRECTIVE` directive is as follows:
//
// - `EVENT` is an event name
// - `DIRECTIVE` is a comma-separated list of mappings `SELECTOR=SELECTOR` and
//    event names.
const RE_INPUT = new RegExp(`^${INPUT}$`);
const RE_EVENT = new RegExp(`^(?<name>([A-Z][A-Za-z]+)+)(?<stops>\\.)?$`);
export const parseOnDirective = (text) => {
  const match = text.split(",").reduce(
    (r, v) => {
      let match = undefined;
      const t = v.trim();
      if ((match = t.match(RE_EVENT))) {
        const { name, stops } = match.groups;
        r.events.push(name);
        if (stops) {
          r.stops = true;
        }
      } else if ((match = t.match(RE_INPUT))) {
        r.inputs.push(parseInput(t));
      }
      return r;
    },
    { inputs: [], events: [] }
  );
  if (match.inputs.length || match.events.length || match.stops) {
    return match;
  } else {
    return null;
  }
};

// We use the attribute nodes directly, as there is an asymetry in
// HTML where an attribute node may be `on:Send`, but `getAttribute("on:Send")`
// will return `null` (while `getAttribute("on:send")` will return
// the value).
// FIXME: Is node is slot, then event handlers are no good
export const findEventHandlers = (node) =>
  [...node.attributes].reduce((r, { name, value }) => {
    if (name.startsWith("on:")) {
      const d = parseOnDirective(value);
      if (!d) {
        onError(
          `templates.view: Could not parse on 'on:*' directive '${value}'`,
          {
            node,
            attr: name,
          }
        );
      } else {
        r = r || {};
        // NOTE: For now we only support relaying the event to the
        // other event, so the handler is basically the path at which we relay.
        r[`${name.at(3).toUpperCase()}${name.substring(4)}`] = d.events;
      }
    }
    return r;
  }, null);
// EOF
