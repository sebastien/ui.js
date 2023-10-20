export const def = (...rest) => {
  for (let v of rest) {
    if (v !== undefined) {
      return v;
    }
  }
};

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

// EOF
