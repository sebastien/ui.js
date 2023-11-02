import { parse, seq, capture, text, or, opt, list } from "../utils/reparser.js";
import { map, values } from "../utils/collections.js";
import { Selector, SelectorInput } from "../selector.js";
import { onError } from "../utils/logging.js";

// ----------------------------------------------------------------------------
// DSL
// ----------------------------------------------------------------------------

// --
// A *path* represents a selection in the data path, it has an optional
// `prefix` and then the `path` itself. Prefix can be:
// - `@` for component local scope
// - `/` for global scope
// - `.` for the current value
// - No prefix means it's selecting from the current scope.
//
// The path is list of names/indices, like `user.0.name`.
const PATH = seq(
  opt(capture("[@/_\\.]", "type")),
  list("([a-zA-Z_0-9]+|#)", text("."), "chunk"),
  opt(capture(text("*"), "card"))
);

const FORMAT = seq(text("|"), capture("[a-zA-Z_0-9]+", "formatter"));

const SELECTION = seq(
  or(
    seq(text("("), capture("[^\\)]+", "expr"), text(")")),
    seq(text("{"), capture("[^\\}]+", "code"), text("}")),
    PATH
  ),
  opt(list(FORMAT, "", "format"))
);

const INPUT = seq(opt(capture("[a-zA-Z]+", "key"), text("=")), SELECTION);
const SELECTOR = list(INPUT, ",", "inputs");

// ----------------------------------------------------------------------------
// HIGH LEVEL API
// ----------------------------------------------------------------------------

export const parseDirective = (text) => {
  console.log(parse(text));
};

const RE_SELECTOR = new RegExp(SELECTOR);
export const parseSelector = (text) => {
  const p = parse(text, RE_SELECTOR);
  // TODO: Support code and expr in selector input
  return new Selector(
    map(
      values(p.inputs),
      (_) => new SelectorInput(_.type, values(_.chunk), _.card === "*")
    )
  );
};

// A literal can be directly converted to JavaScript and does not use
export const parseLiteral = (text) => {
  return text && text.startsWith("(") && text.endsWith(")")
    ? JSON.parse(text.slice(1, -1))
    : text;
};

// An expression makes use of the context
export const parseExpression = (text) => {
  return text && text.startsWith("{") && text.endsWith("}")
    ? text.slice(1, -1)
    : null;
};

export const parseOnDirective = (text) => parseSelector(text);

export const parseForDirective = (text) => {
  const res = parseSelector(text);
  if (res) {
    if (res.inputs.length !== 1) {
      onError(
        `For directive expects just one selection, got ${res.inputs.length}`
      );
    }
  }
  // It's a for directive, so it's always going to be many
  res.isMany = true;
  return res;
};

export const parseOutDirective = (text) => {
  // TODO: Should support template
  return { selector: parseSelector(text), template: null };
};

// EOF
