// --
// ## Paths

// -- doc
// Returns the path of the given `node` up until the given `root`, as an
// array of indices from `children`.
export const nodePath = (node, root = undefined) => {
	const path = [];
	while (node && node != root && node.parentNode) {
		const children = node.parentNode.childNodes;
		for (let i = 0; i < children.length; i++) {
			if (children[i] === node) {
				path.push(i);
				break;
			}
		}
		node = node.parentNode;
	}
	return path.reverse(), path;
};

// -- doc
// Returns the node at the given `path` for the given `root` node.
export const pathNode = (path, root) =>
	// NOTE: This is not a strict implementation, we'll return the current node
	// if the node is not a element or fragment.
	path.reduce(
		(r, v) =>
			r &&
			(r.nodeType === Node.ELEMENT_NODE ||
				r.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
				? r.childNodes[v]
				: r,
		root
	);

// -- doc
// Returns the value at the given `path` for the given `data`.
export const pathData = (path, data, offset = 0, origin) => {
	const n = path?.length || 0;
	while (offset < n) {
		const key = path[offset++];
		switch (key) {
			case "@":
				// We skip the '@' symbol.
				return offset == 1
					? origin
						? origin.at(-1)
						: undefined
					: path[offset - 1];
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
		(r, v) =>
			v
				? v[0] === ""
					? [...r, ...v.slice(1)]
					: v[0] === "@"
					? r
					: v
				: r,
		[]
	);

// -- doc
// Parses the given `path` (as a string) and returns a path array.
export const parsePath = (path) => {
	if (path instanceof Array) {
		return path;
	} else {
		const p = path ? (path.trim() === "." ? [] : path.split(".")) : [];
		for (const i in p) {
			const k = p[i];
			if (k.match(/^\d+$/)) {
				p[i] = parseInt(k);
			}
		}
		return p;
	}
};

export const commonPath = (paths) => {
	let i = 0;
	let n = paths.reduce(
		(r, _, i) => (i === 0 ? _.length : Math.min(_.length, r)),
		0
	);
	const op = paths[0];
	while (i < n) {
		for (const cp of paths) {
			if (cp[i] !== op[i]) {
				return cp.slice(0, i);
			}
		}
		i++;
	}
	return op.slice(0, n);
};

// EOF
