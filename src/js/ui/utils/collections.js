import { type, isObject } from "./values.js";
// --
// ## Structures
//
export const asMappable = (f) => (_) => _ instanceof Array ? _.map(f) : f(_);

// Fixm: this should probably expand objects to their values
export const list = (_) =>
  _ instanceof Array
    ? _
    : _ instanceof Map
    ? [_.values]
    : _ !== null && _ !== undefined
    ? [_]
    : [];

export const reduce = (v, f, r) => {
  if (v === undefined) {
    return v;
  } else if (v instanceof Array) {
    return v.reduce(f, r);
  } else if (v instanceof Map) {
    for (const [k, w] of v.entries()) {
      const rr = f(r, w, k);
      r = rr !== undefined ? rr : r;
    }
    return r;
  } else if (isObject(v)) {
    for (const k in v) {
      const rr = f(r, v[k], k);
      r = rr !== undefined ? rr : r;
    }
    return r;
  }
};
export const map = (v, f) => {
  if (v === undefined) {
    return v;
  } else if (v instanceof Array) {
    return v.map(f);
  } else if (v instanceof Map) {
    const r = new Map();
    for (const [k, w] of v.entries()) {
      r.set(k, f(w, k));
    }
    return r;
  } else if (isObject(v)) {
    const res = {};
    for (const k in v) {
      res[k] = f(v[k], k);
    }
    return res;
  } else {
    return f(v);
  }
};

export const filter = (v, f) => {
  if (v === undefined) {
    return v;
  } else if (v instanceof Array) {
    return v.filter(f);
  } else if (v instanceof Map) {
    const r = new Map();
    for (const [k, w] of v.entries()) {
      if (f(w, k)) {
        r.set(k, w);
      }
    }
    return r;
  } else if (isObject(v)) {
    const res = {};
    for (const k in v) {
      const w = v[k];
      if (f(w, k)) {
        res[k] = w;
      }
    }
    return res;
  } else {
    return f(v);
  }
};

export const each = (v, f) => {
  if (v === undefined) {
    return true;
  } else if (v instanceof Array) {
    let i = 0;
    for (const w of v) {
      if (f(w, i++) === false) {
        return false;
      }
    }
    return true;
  } else if (v instanceof Map) {
    for (const [k, w] of v.entries()) {
      if (f(w, k) === false) {
        return false;
      }
    }
    return true;
  } else if (isObject(v)) {
    for (const k in v) {
      if (f(v[k], k) === false) {
        return false;
      }
    }
    return true;
  } else if (v !== undefined) {
    return f(v) === false ? false : true;
  }
};

// FIXME: Should be iterator
export const values = (v) => {
  if (v instanceof Array) {
    return v;
  } else if (isObject(v)) {
    return Object.values(v);
  } else if (v instanceof Map) {
    return [...v.values()];
  } else if (v !== null && v !== undefined) {
    return [v];
  } else {
    return [];
  }
};

// FIXME: Should be iterator
export const keys = (v) => {
  if (v instanceof Array) {
    return range(v.lenght);
  } else if (isObject(v)) {
    return Object.keys(v);
  } else if (v instanceof Map) {
    return [...v.keys()];
  } else if (v !== null && v !== undefined) {
    return [];
  } else {
    return [];
  }
};

export function* items(v) {
  if (v instanceof Array) {
    let i = 0;
    for (const _ of v) {
      yield [i++, _];
    }
  } else if (isObject(v)) {
    for (const k of v) {
      yield [k, v[k]];
    }
  } else if (v instanceof Map) {
    for (const kv of v.entries()) {
      yield kv;
    }
  }
}

export const range = (start, end, step = 1, closed = false) => {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  const n = Math.ceil(Math.max(0, (end - start) / step)) + (closed ? 1 : 0);
  const r = new Array(n);
  let v = start;
  for (let i = 0; i < n; i++) {
    r[i] = v;
    v += step;
  }
  return r;
};

export const copy = (value) =>
  value === null
    ? null
    : typeof value === "object"
    ? value instanceof Array
      ? [...value]
      : { ...value }
    : value;

export const access = (context, path, offset = 0) => {
  if (path && path.length && context !== undefined) {
    const n = path.length;
    // Note that it's a feature here to allow an offset greater than the path
    for (let i = offset; i < n; i++) {
      // TODO: We may want to deal with number vs key
      context = context[path[i]];
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

export const last = (stream) => {
  let res = null;
  for (const _ of stream) {
    res = _;
  }
  return res;
};

export const trigger = (handlers, ...value) => {
  let i = 0;
  for (const _ of values(handlers)) {
    i++;
    if (_(...value) === false) {
      return i;
    }
  }
  return i;
};

// EOF
