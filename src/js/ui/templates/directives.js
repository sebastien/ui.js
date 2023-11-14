import { parse, seq, capture, text, or, opt, list } from "../utils/reparser.js";
import { map, reduce, values } from "../utils/collections.js";
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

const CODE = seq(text("{"), capture("[^\\}]+", "code"), text("}"));
const EXPR = seq(text("("), capture("[^\\)]+", "expr"), text(")"));
const FORMAT = seq(text("|"), or(capture("[a-zA-Z_0-9]+", "formatter"), CODE));

const SELECTION = seq(or(EXPR, CODE, PATH), opt(list(FORMAT, "", "format")));

const INPUT = seq(opt(capture("[a-zA-Z]+", "key"), text("=")), SELECTION);
const PROCESSOR = seq(text("->{"), capture("[^\\}]+", "processor"), text("}"));
const SELECTOR = seq(list(INPUT, ",", "inputs"), opt(PROCESSOR));
// ----------------------------------------------------------------------------
// HIGH LEVEL API
// ----------------------------------------------------------------------------

export const parseDirective = (text) => {
  console.log(parse(text));
};

const RE_SELECTOR = new RegExp(SELECTOR);
export const parseSelector = (text) => {
  const p = parse(text, RE_SELECTOR);
  // FIXME: Here it is not clear if we should have a format per input,
  // or an overall format. Maybe `||` should format the overall and `|` just
  // one input?
  // const formats = reduce(
  //   p.inputs,
  //   (r, { format }) =>
  //     reduce(
  //       format,
  //       (r, { code, formatter }) => (r.push({ code, formatter }), r),
  //       r
  //     ),
  //   []
  // );

  console.log("XXX PARSE SELCETOR", text, { p });
  // TODO: Support code and expr in selector input
  return new Selector(
    map(
      values(p.inputs),
      (_) => new SelectorInput(_.type, values(_.chunk), _.card === "*")
    )
  );
};

const RE_NUMBER = new RegExp("^\\d+(\\.\\d+)?$");
// A literal can be directly converted to JavaScript and does not use
export const parseLiteral = (text) => {
  return text && text.startsWith("(") && text.endsWith(")")
    ? JSON.parse(text.slice(1, -1))
    : RE_NUMBER.test(text)
    ? parseFloat(text)
    : text === "true"
    ? true
    : text === "false"
    ? false
    : text;
};

// An expression makes use of the context
export const parseExpression = (text) => {
  return text && text.startsWith("{") && text.endsWith("}")
    ? text.slice(1, -1)
    : null;
};

const RE_INLINE_ON = new RegExp(
  seq(
    opt(seq(capture("[A-Za-z_0-9]+", "slot"), text("="))),
    seq(text("{"), capture("[^}]+", "expr"), text("}"))
  )
);
export const parseOnDirective = (text) => {
  // Case 1: It's an inline expression
  // (assign?=){expression})
  const p = parse(text, RE_INLINE_ON);
  return p;
};

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
