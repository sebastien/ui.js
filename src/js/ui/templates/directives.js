import {
  parse,
  makematch,
  seq,
  capture,
  text,
  or,
  opt,
  not,
  list,
} from "../utils/reparser.js";
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

const CODE = seq(text("{"), capture("[^\\}]+", "code"), text("}"));
const EXPR = seq(text("("), capture("[^\\)]+", "expr"), text(")"));
const FORMAT = seq(text("|"), or(capture("[a-zA-Z_0-9]+", "formatter"), CODE));

const TARGET = seq(capture("[a-zA-Z_0-9]+", "target"), text("="));
const SELECTION = seq(or(EXPR, CODE, PATH), opt(list(FORMAT, "", "format")));

const INPUT = seq(opt(capture("[a-zA-Z]+", "key"), text("=")), SELECTION);
const PROCESSOR = seq(text("->{"), capture(".+", "processor"), text("}"), "$");
const SELECTOR = seq(opt(TARGET), list(INPUT, ",", "inputs"), opt(PROCESSOR));

// ---------------------------------------------------------------------------- HIGH LEVEL API
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

  // TODO: Support code and expr in selector input
  const inputs = map(
    values(p.inputs),
    (_) => new SelectorInput(_.type, values(_.chunk), _.card === "*")
  );
  return new Selector(
    // Inputs
    inputs,
    // Format
    p.processor
      ? new Function(
          ...inputs
            .map((v) => {
              const k = v.path.at(-1);
              return k === "#" ? "key" : k;
            })
            .concat(["$", `return (${p.processor})`])
        )
      : null,
    // Target
    p.target
  );
};

const RE_NUMBER = new RegExp("^\\d+(\\.\\d+)?$");
// A literal can be directly converted to JavaScript and does not use
export const parseLiteral = (text) => {
  return text &&
    ((text.startsWith("[") && text.endsWith("]")) ||
      (text.startsWith("{") && text.endsWith("}")))
    ? JSON.parse(text.slice(1, -1))
    : text && text.startsWith("(") && text.endsWith(")")
    ? new Function(`{return ${text}}`)()
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

const RE_ON = new RegExp(
  or(
    seq(
      // Slot is like, "asdsasd=" or "slot!=" to force an assignment
      opt(
        seq(
          capture("[A-Za-z_0-9]+", "assign"),
          opt(capture(text("!"), "force")),
          text("=")
        )
      ),
      opt(
        // There's an optional input a,b,c->
        opt(list(or("[a-zA-Z]+", text("#")), ",", "inputs"), "->"),
        // With an expression like `{....}`
        seq(
          text("{"),
          capture(not(or(text("}!"), "}$"), ".+"), "handler"),
          text("}")
        )
      ),
      opt(
        // The event itself
        seq(text("!"), capture("[A-Za-z]+", "event")),
        // And a event processor
        opt(
          text("|"),
          opt(list(or("[a-zA-Z]+", text("#")), ",", "eventInputs"), "->"),
          text("{"),
          capture(not("}$", ".+"), "eventProcessor"),
          text("}")
        )
      ),
      "$"
    ),
    seq(capture("[A-Za-z_0-9]+", "slot"))
  )
);
export const parseOnDirective = (value) => {
  const match = parse(value, RE_ON, true);
  if (!match) {
    onError("Could not parse this 'on' directive", { directive: value });
    return null;
  } else if (match.index !== 0 || match[0].length !== value.length) {
    onError("Could not fully parse this 'on' directive", {
      matched: value.substring(0, match[0].length),
      unrecognized: value.substring(match[0].length),
      directive: value,
    });
    return null;
  } else {
    const res = makematch(match);
    return res;
  }
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
