import { list } from "./utils.js";

export const bind = (node, handlers) =>
  (handlers &&
    Object.entries(handlers).forEach(([k, v]) =>
      list(node).forEach((_) => _.addEventListener(k, v))
    )) ||
  node;

export const unbind = (node, handlers) =>
  (handlers &&
    Object.entries(handlers).forEach(([k, v]) =>
      list(node).forEach((_) => _.removeEventListener(k, v))
    )) ||
  node;

// EOF
