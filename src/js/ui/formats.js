// --
// ## Formats
export const bool = (_) => (_ ? true : false);
export const text = (_) => `${_}`;
export const not = (_) => !bool(_);
export const idem = (_) => _;
export const type = (_) => {
  const t = typeof _;
  switch (_) {
    case null:
      return "null";
    case undefined:
      return "undefined";
    default:
      switch (t) {
        case "number":
        case "string":
          return _;
        default:
          return _ instanceof Array
            ? "array"
            : Object.getPrototypeOf(_) === Object
            ? "dict"
            : "object";
      }
  }
};

export const format = (value, format) => (Formats[format] || idem)(value);
export const Formats = { bool, text, not, idem, type };
// EOF
