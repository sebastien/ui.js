// --
// ## Tree Walking
//
// Processing templates requires walking through the nodes in the tree
// and looking for special nodes.
export const isBoundaryNode = (node) => {
  if (node && node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node?.parentNode?.tagName;
    switch (tagName) {
      // SVG has lowercase node names, HTML has uppercase
      case "TEMPLATE":
      case "template":
      case "SLOT":
      case "slot":
        return true;
    }
    // NOTE: New syntax added to the templates should be registered here,
    // so that we identify boundary nodes.
    // x:case="..." nodes are also boundaries
    if (
      // do:case are a template in themselves
      node.hasAttribute("do:case") ||
      // Children of x:for nodes are part of a new view
      node.parentNode?.hasAttribute("x:for")
    ) {
      return true;
    }
    // When effectors are also boundary nodes, so we stop at any
    // of their children.
    else if (node.parentElement && node.parentElement.hasAttribute("when")) {
      return true;
    }
  } else {
    return false;
  }
};

// --
// We don't want to recurse through filters.
export const TreeWalkerFilter = {
  acceptNode: (node) => {
    return isBoundaryNode(node)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT;
  },
};

// -- doc
// Iterates through the attributes of the given `node` which
// name matches `regexp`.
export const iterAttributesLike = function* (node, regexp) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      // NOTE: Not sure that would work for XHTML
      const match = regexp.exec(attr.name);
      if (match) {
        yield [match, attr];
      }
    }
  }
};

// -- doc
// Iterates through the attributes that match the given RegExp. This is
// because we need to query namespace selectors.
export const iterAttributes = function* (node, regexp) {
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT,
    TreeWalkerFilter
  );
  for (const r of iterAttributesLike(node, regexp)) {
    yield r;
  }
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const r of iterAttributesLike(node, regexp)) {
      yield r;
    }
  }
};

export const iterNodes = function* (node, ...names) {
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT,
    TreeWalkerFilter
  );
  // We will yield on the root node if it matches
  for (const n of names) {
    if (node.nodeName == n) {
      yield node;
    }
  }
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const name = node.nodeName;
    for (const n of names) {
      if (name === n) {
        yield node;
      }
    }
  }
  // FIXME: Why is this commented out?
  // while (node) {
  //   const name = node.nodeName;
  //   console.log("NODE", { node, name });
  //   for (let n of names) {
  //     if (name === n) {
  //       yield node;
  //     }
  //   }
  //   walker.nextNode();
  //   node = walker.currentNode;
  // }
};

// -- doc
// Iterates through the descendants of `node` (including itself), yielding
// nodes that match the given `selector`.
//
// NOTE: This does not stop at boundary nodes (see  `isBoundaryNode`).
export const iterSelector = function* (node, selector) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.matches(selector)) {
      yield node;
    }
    for (const _ of node.querySelectorAll(selector)) {
      yield _;
    }
  }
};

// EOF
