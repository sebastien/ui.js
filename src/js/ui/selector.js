// --
// ## Selector DSL
//
const KEY = "([a-zA-Z]+=)?";
const PATH = "([@.]?[A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*";
const FORMAT = "(\\|[A-Za-z-]+)?";
const INPUT = `${KEY}${PATH}${FORMAT}`;
const INPUT_FIELDS = `^((?<key>[a-zA-Z]+)=)?(?<path>${PATH})(\\|(?<format>[A-Za-z-]+))?$`;
const INPUTS = `${INPUT}(,${INPUT})*`;

// const VALUE = "=(?<value>\"[^\"]*\"|'[^']*'|[^\\s]+)";
const SOURCE = "(:(?<source>(\\.?[A-Za-z0-9]+)(\\.[A-Za-z0-9]+)*))?";
const EVENT = "(!(?<event>[A-Za-z]+(\\.[A-Za-z]+)*)(?<stops>\\.)?)?";
const RE_SELECTOR = new RegExp(`^(?<inputs>${INPUTS})${EVENT}$`);

// -- doc
// Parses the given selector and returns an `{inputs,event,stops}` structure.
export const parseSelector = (text) => {
  const match = text.match(RE_SELECTOR);
  if (!match) {
    return null;
  }
  const { event, stops } = match.groups;
  const inputs = match.groups["inputs"].split(",").map((_) => {
    const { key, path, format } = _.match(INPUT_FIELDS).groups;
    return {
      key,
      path,
      format,
      type: path.startsWith("@")
        ? "local"
        : path.startsWith(".")
        ? "relative"
        : "absolute",
    };
  });
  return { inputs, event, stops };
};

// EOF
