// --
// ## Paths

// -- doc
// Returns the path of the given `node` up until the given `root`, as an
// array of indices from `children`.
export const nodePath = (node, root = undefined) => {
  const path = [];
  while (node && node != root && node.parentElement) {
    const children = node.parentElement.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i] === node) {
        path.push(i);
        break;
      }
    }
    node = node.parentElement;
  }
  return path.reverse(), path;
};

// -- doc
// Returns the node at the given `path` for the given `root` node.
export const pathNode = (path, root) =>
  path.reduce((r, v) => (r ? r.childNodes[v] : r), root);

// -- doc
// Returns the value at the given `path` for the given `data`.
export const pathData = (path, data, offset = 0) => {
  const n = path.length;
  while (offset < n) {
    const key = path[offset++];
    switch (key) {
      case "":
        break;
      default:
        data = data[key];
    }
    if (data === undefined) {
      return undefined;
    }
  }
  return data;
};

// -- doc
// Takes two paths and composes them together. If a path starts with `["",...]`
// then it is relative, otherwise it is absolute.
export const composePaths = (...chunks) =>
  // TODO: We should probably start from the end and stop at the first
  // absolute path we find.
  chunks.reduce(
    (r, v) => (v ? (v[0] === "" ? [...r, ...v.slice(1)] : v) : r),
    []
  );

// -- doc
// Parses the given `path` (as a string) and returns a path array.
export const parsePath = (path) => {
  if (path instanceof Array) {
    return path;
  } else {
    const p = path ? (path.trim() === "." ? [] : path.split(".")) : [];
    for (let i in p) {
      const k = p[i];
      if (k.match(/^\d+$/)) {
        p[i] = parseInt(k);
      }
    }
    return p;
  }
};

// EOF
