import { bool as _bool, type } from "./utils.js";

// --
// ## Formats
export const bool = _bool;
export const text = (_) => `${_}`;
export const attr = (_) => (bool(_) ? text(_) : "");
export const not = (_) => !bool(_);
export const idem = (_) => _;
export const format = (value, format) => (Formats[format] || idem)(value);
export const Formats = { bool, text, not, idem, type, attr };
// EOF
