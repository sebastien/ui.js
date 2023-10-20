import { numcode } from "./text.js";

// --
// ## Key Generation

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

// EOF
