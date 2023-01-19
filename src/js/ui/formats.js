// --
// ## Formats
export const bool = (_) => (_ ? true : false);
export const text = (_) => `${_}`;
export const not = (_) => !bool(_);
export const idem = (_) => _;

export const Formats = { bool, text, not, idem };
// EOF
