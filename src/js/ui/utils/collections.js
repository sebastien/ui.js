import { type } from "./values.js";
// --
// ## Structures
export const asMappable = (f) => (_) => _ instanceof Array ? _.map(f) : f(_);
export const list = (_) =>
  _ instanceof Array ? _ : _ !== null && _ !== undefined ? [_] : [];
export const reduce = (v, f, r) => {
  if (v instanceof Array) {
    return v.reduce(f, r);
  } else {
    for (let k in v) {
      const rr = f(r, v[k], k);
      r = rr !== undefined ? rr : r;
    }
    return r;
  }
};
export const map = (v, f) => {
  if (v instanceof Array) {
    return v.map(f);
  } else {
    const res = {};
    for (let k in v) {
      res[k] = f(v[k], k);
    }
    return res;
  }
};

export const each = (v, f) => {
  for (let k in v) {
    f(v[k], k);
  }
};

export const copy = (value) =>
  value === null
    ? null
    : typeof value === "object"
    ? value instanceof Array
      ? [...value]
      : { ...value }
    : value;

export const access = (context, path) => {
  if (path && path.length && context !== undefined) {
    for (const k of path) {
      // TODO: We may want to deal with number vs key
      context = context[k];
      if (context === undefined) {
        break;
      }
    }
  }
  return context;
};

export const len = (value) => {
  switch (type(value)) {
    case "array":
      return value.length;
    case "map":
      return Object.keys(value).length;
    case "object":
      return value.length || 0;
    default:
      return 0;
  }
};

export const assign = (scope, path, value) => {
  let s = scope;
  const n = path.length - 1;
  for (let i = 0; i <= n; i++) {
    const k = path[i];
    if (i === n) {
      s[k] = value;
    } else if (s[k] === undefined || s[k] === null) {
      s[k] = typeof path[i + 1] === "number" ? [] : {};
    }
    s = s[k];
  }
  return scope;
};

// EOF
