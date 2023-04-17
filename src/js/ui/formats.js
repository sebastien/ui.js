import { bool as _bool, type, len } from "./utils.js";

// --
// ## Formats
export const bool = _bool;
export const text = (_) => `${_}`;
export const attr = (_) => (bool(_) ? text(_) : "");
export const not = (_) => !bool(_);
export const idem = (_) => _;
export const format = (value, format) => (Formats[format] || idem)(value);
export const debug = (value) => {
  console.log("[uijs.debug] Slot value:", { value });
  return value;
};
export const Formats = { bool, text, not, idem, type, attr, len, debug };
// EOF
