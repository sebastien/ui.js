// --
// # Diffing Operations
//
// These diffing operations are implemented using handlers, so that they can
// recurse.

export const onArrayChange = (a, b, onAdd, onRemove, onChange, path = []) => {
  const na = a.length;
  const nb = b.length;
  const n = Math.min(na, nb);
  const m = Math.max(na, nb);
  let i = 0;
  // Common values
  while (i < n) {
    if (a[i] !== b[i]) {
      onChange(i, a[i], undefined);
    }
    i++;
  }
  // Added or removed values
  const isa = m == na ? onRemove : onAdd;
  while (i < m) {
    onChange(i, isa ? i : undefined, isa ? undefined : i);
    i++;
  }
};

export const onObjectChange = (a, b, onChange, path = []) => {
  for (let k in a) {
    const ak = a[k];
    const bk = b[k];
    if (ak !== bk) {
      onChange(k, ak, bk);
    }
  }
  for (let k in b) {
    const ak = a[k];
    const bk = b[k];
    if (ak !== bk && ak === undefined) {
      onChange(k, undefined, bk);
    }
  }
};

export const onValueChange = (a, b, onChange) => {
  const ta = a === "null" ? "null" : typeof a;
  const tb = b === "null" ? "null" : typeof b;
  if (ta !== tb) {
    if (b === undefined) {
      return onChange(null, a, b);
    }
  } else if (a !== b) {
    switch (ta) {
      case "object":
        if (a instanceof Array) {
          return onArrayChange(a, b, onChange);
        } else {
          return onObjectChange(a, b, onChange);
        }
      default:
        return onChange(null, a, b);
    }
  }
};

export const changes = (a, b, onChange) => {
  return onValueChange(a, b, onChange);
};

// EOF
