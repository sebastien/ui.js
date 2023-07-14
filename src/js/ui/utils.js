// --
//  # Utilities

export const Options = {
  debug: false,
  anchors: false,
  allowDuplicateTemplates: false,
  exportState: true,
};

export const Empty = Symbol("Empty");
export const Any = Symbol("Any");
export const RawObjectPrototype = Object.getPrototypeOf({});

export const createComment = (text) =>
  Options.anchors === null
    ? document.createTextNode("")
    : document.createComment(Options.anchors === "short" ? "" : text);

// FIXME: Should be isNothing
export const isEmpty = (value) =>
  value === null || value === undefined || value === Empty;
export const isAtom = (value) =>
  isEmpty(value) ||
  typeof value !== "object" ||
  (Object.getPrototypeOf(value) !== RawObjectPrototype &&
    !(value instanceof Array));

export const bool = (value) =>
  value === null ||
  value === undefined ||
  value === false ||
  value === "" ||
  (value instanceof Array && value.length === 0)
    ? false
    : true;

export const onWarning = (message, ...context) => {
  console.warn("[uijs]", message, ...context);
};
export const onError = (message, ...context) => {
  console.error("[uijs]", message, ...context);
};
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
        case "boolean":
        case "function":
          return t;
        default:
          return _ instanceof Array
            ? "array"
            : Object.getPrototypeOf(_) === RawObjectPrototype
            ? "map"
            : "object";
      }
  }
};

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

// --
// ## Key Generation

export const numfmt = (value, precision = 0) => {
  const p = Math.pow(10, precision);
  const v = parseFloat(value);
  const w = Math.round(v * p);
  const k = `${w}`;
  const i = k.length - precision;
  return precision && v * p != w
    ? `${k.substring(0, i) || "0"}.${k.substring(i) || "0"}`
    : value;
};

export const numcode = (
  number,
  alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
) => {
  const res = [];
  const n = alphabet.length;
  let v = number;
  while (v > 0) {
    const r = v % n;
    v = Math.floor(v / n);
    res.unshift(alphabet.charAt(r));
  }
  return res.join("");
};

// --
// `makeKey(scope)` returns sequential keys for the given scope. This
// ensures that ids are reproducible.
const Keys = new Map();
export const makeKey = (scope = "key") => {
  let v = Keys.get(scope);
  Keys.set(scope, (v = v === undefined ? 0 : v + 1));
  return `${scope}-${v}`;
};

// --
// Generates a new Id. This is not reproducible.
export const makeId = () =>
  numcode(new Date().getTime() * 100000 + Math.random() * 100000);

export const nextKey = (value) => {
  if (value instanceof Array) {
    value.push(undefined);
    return value.length - 1;
  } else {
    while (true) {
      const k = makeId();
      if (value[k] === undefined) {
        return k;
      }
    }
  }
};

export const hash = (value, seed = 5381) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let hash = seed,
    i = text.length;
  while (i) {
    hash = (hash * 33) ^ text.charCodeAt(--i);
  }
  return hash >>> 0;
};

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

export const def = (...rest) => {
  for (let v of rest) {
    if (v !== undefined) {
      return v;
    }
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

// ## Functional

const Memoized = new Map();
export const memo = (guards, functor) => {
  const scope = (guards instanceof Array ? guards : [guards]).reduce((r, v) => {
    if (r.has(v)) {
      return r.get(v);
    } else {
      const w = new Map();
      r.set(v, w);
      return w;
    }
  }, Memoized);
  if (!scope.has(true)) {
    scope.set(true, functor());
  }
  return scope.get(true);
};

// ## Math

export const Enum = (...values) =>
  Object.freeze(
    values.reduce((r, v) => {
      r[`${v}`] = typeof v === "string" ? Symbol(v) : v;
      return r;
    }, {})
  );

export const round = (number, factor = 1, bound = 1) => {
  const base = number / factor;
  const roundedBase =
    bound < 0
      ? Math.floor(base)
      : bound > 0
      ? Math.ceil(base)
      : Math.round(base);
  return roundedBase * factor;
};

export const prel = (v, a, b) => (v - a) / (b - a);
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a = 0.0, b = 1.0) => Math.min(Math.max(v, a), b);
export const minmax = (a, b) => [Math.min(a, b), Math.max(a, b)];
export const range = (count) => new Array(count).fill(0).map((_, i) => i);
export const steps = (count) =>
  range(count)
    .map((_) => _ / count)
    .concat([1.0]);
// EOF
