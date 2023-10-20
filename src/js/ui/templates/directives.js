import { Formats } from "../formats.js";
import { Selector, SelectorInput } from "../selector.js";
import { onError } from "../utils/logging.js";

export const KEY = "([a-zA-Z]+=)?";
//
// FIXME: We can't have both local and relative
export const PATH =
  "(#|(([@/]?\\.*)(\\*|([A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*(\\.\\*)?)))";
export const FORMAT = "(\\|[A-Za-z-]+)*";
export const INPUT = `${KEY}${PATH}${FORMAT}`;
export const INPUTS = `(\\((?<inputList>${INPUT}(,${INPUT})*)\\)(?<inputListFormat>${FORMAT})|(?<inputSeq>${INPUT}(,${INPUT})*))`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
export const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
export const SELECTOR = `^(?<selector>${INPUTS})`;
const RE_SELECTOR = new RegExp(SELECTOR);
// -- doc
// `parseValue` parses a text value into its JavaScript representation. Note
// that this function uses `eval()` and is not safe to use with foreign
// code.
const RE_NUMBER = /^\d+(\.\d+)?$/;
export const parseValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  switch (value) {
    case "true":
      return true;
    case "false":
      return false;
    case "null":
      return null;
    case "undefined":
      return undefined;
  }
  // FIXME: This is quite error prone
  switch (value.at(0)) {
    case '"':
    case "'":
    case "`":
    case "{":
    case "[":
    case "(":
      // SEC: This is subject to injection.
      return eval(value);
    default:
      return RE_NUMBER.test(value) ? parseFloat(value) : value;
  }
};

export const isCodeDirective = (value) =>
  (value.startsWith("{") && value.endsWith("}")) ||
  (value.startsWith("(") && value.endsWith(")"));

// --
// `([1,2,3)` represents a JavaScript value
// `{_ + 10, _ + 40}` represents a JavaScript expression
export const parseCodeDirective = (value) => {
  value.startsWith("{") && value.endsWith("}")
    ? eval(`(_)=>{return (${value.slice(1, -1)});}`)
    : value.startsWith("(") && value.endsWith(")")
    ? eval(value)
    : null;
};

export const parseDirective = (value) => {
  if (isCodeDirective(value)) {
    return parseCodeDirective(value);
  } else {
    return parseSelectorInput(value);
  }
};
//
//
// --
// ### Handling events: `on:EVENT=DIRECTIVE`.
//
// The `on:EVENT=DIRECTIVE` directive is as follows:
//
// - `EVENT` is an event name
// - `DIRECTIVE` is a comma-separated list of mappings `SELECTOR=SELECTOR` and
//    event names.
const RE_ON_INPUT = new RegExp(`^${INPUT}$`);
const RE_ON_EVENT = new RegExp(`^(?<name>([A-Z][A-Za-z]+)+)(?<stops>\\.)?$`);
export const parseOnDirective = (text) => {
  const match = text.split(",").reduce(
    (r, v) => {
      let match = undefined;
      const t = v.trim();
      if ((match = t.match(RE_ON_EVENT))) {
        const { name, stops } = match.groups;
        r.events.push(name);
        if (stops) {
          r.stops = true;
        }
      } else if ((match = t.match(RE_ON_INPUT))) {
        r.inputs.push(parseDirective(t));
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

// --
// Parse the given input, returning a `SelectorInput` structure.
export const RE_INPUT = new RegExp(
  `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(?<formats>(\\|[A-Za-z-]+)+)?$`
);

export const parseFormat = (text) => {
  const formatters = (text || "").split("|").reduce((r, v) => {
    const f = Formats[v];
    if (!v) {
      return r;
    } else if (f === undefined) {
      onError(
        `Could not find format ${v} in selector ${text}, pick one of ${Object.keys(
          Formats
        ).join(", ")}`
      );
      return r;
    } else {
      r.push(f);
      return r;
    }
  }, []);
  return formatters.length === 0
    ? null
    : formatters.length === 1
    ? formatters[0]
    : (_, scope) => formatters.reduce((r, v) => v(r, scope), _);
};

export const parseSelectorInput = (text) => {
  const match = text.match(RE_INPUT);
  if (!match) {
    return null;
  }
  const { key, path, formats } = match.groups;
  return new SelectorInput(path, parseFormat(formats), key);
};

// -- doc
// Parses the given selector and returns an `{inputs,event,stops}` structure.
export const parseSelector = (text) => {
  const match = text.match(RE_SELECTOR);
  if (!match) {
    return null;
  }
  const { event, stops, inputList, inputListFormat, inputSeq } = match.groups;
  const parsedInputs = (inputList || inputSeq).split(",").map((t, i) => {
    const res = parseSelectorInput(t);
    if (!res) {
      onError(
        `selector.parseSelector: Could not parse input ${i} "${t}" in "${text}"`,
        {
          input: t,
          text,
          match,
        }
      );
    }
    return res;
  });
  return new Selector(parsedInputs, event, stops, parseFormat(inputListFormat));
};
const RE_OUT = new RegExp(`^${SELECTOR}(:(?<template>[A-Za-z]+))?$`);
export const parseOutDirective = (text) => {
  const match = text.match(RE_OUT);
  if (!match) {
    return null;
  } else {
    const { selector, template } = match.groups;
    return {
      selector: selector ? parseSelector(selector) : null,
      template,
    };
  }
};
// EOF
