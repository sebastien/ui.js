import { EventEffector } from "../effectors/event.js";
import { nodePath } from "../path.js";
import { onError } from "../utils/logging.js";
import { parseOnDirective } from "../templates/directives.js";

export const onOnAttribute = (processor, attr, root, name) => {
	const node = attr.ownerElement;
	// NOTE: If the attr has no owner, it has already been proccessed.
	if (!node) {
		return null;
	}
	const directive = parseOnDirective(attr.value);
	if (!directive) {
		onError("Unsupported directive", attr.value);
	}
	const handler = directive.handler
		? new Function(
				"event",
				"scope",
				"node",
				"$",
				`${Object.values(directive.inputs)
					.map((_) =>
						_ === "key" || _ === "#"
							? `const key=scope.key !== undefined ? scope.key : scope.path ? scope.path.at(-1) : null;`
							: `const ${_}=scope.get("${_}");`
					)
					.join("")}; return (${directive.handler})`
		  )
		: // NOTE: expr is not really there, but maybe we want to support it?
		directive.expr
		? new Function(
				"event",
				"scope",
				"node",
				"$",
				`{const _=event;return (${directive.expr});}`
		  )
		: undefined;
	console.log("ON", { directive, handler });
	node.removeAttribute(attr.name);
	// FIXME: A `<slot out:XXX>` node  may have `on:XXX` attributes as well, in which
	// case they've already been processed at that point.
	if (node && node.parentNode) {
		return new EventEffector(
			nodePath(node, root),
			name,
			directive,
			handler
		);
	}
	return null;
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
