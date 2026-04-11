# UI.js Specification: Improve Rendering

## Overview

The rendering architecture of `ui-faster` relies heavily on mapping data into the DOM through effectors (`MappingEffect`, `ConditionalEffect`, etc.). As dynamic interfaces scale, rendering strategies must be highly optimized and provide escape hatches for interacting with native DOM nodes and external libraries.

This specification addresses the gaps in DOM reconciliation and imperative node access.

## 1. DOM Element References (`ref`)

### Problem
Real-world applications often need imperative access to DOM nodes to call native methods like `.focus()`, `.select()`, or to integrate with non-reactive third-party libraries (e.g., charting frameworks, WebGL contexts, rich text editors).

### Proposed Solution
Formalize a `ref` mechanism (e.g., `ref={mySlot}`):
- A dedicated effector that binds the mounted DOM element to a specified `Slot` or context key once the node is attached to the document.
- Resolves during the `onMount` phase so the reference is guaranteed to point to a live DOM node.
- Nullifies or clears the reference when the node is unmounted, preventing memory leaks.

## 2. Granular List Updates (DOM Reconciliation and Keyed Lists)

### Problem
`MappingEffect` currently iterates over arrays and re-renders items based primarily on their index. When an array is shifted, unshifted, or randomly sorted, elements are needlessly destroyed and recreated, or contents are entirely overwritten. This kills performance in data-grids or large lists and loses local DOM state (e.g., focus, input values, CSS animations) because the identity of elements changes.

### Proposed Solution
Implement keyed reconciliation (similar to React's `key` or Vue's `:key`):
- Extend `MappingEffect` to support tracking elements by a unique identifier (`item.id`) rather than just their index.
- When the source array updates, compare the new sequence of keys against the old sequence.
- Intelligently move existing DOM nodes to match their new positions, only destroying or mounting nodes for keys that were explicitly added or removed.
- Prevent overwriting the inner state of moved nodes, preserving active elements like text inputs and CSS transitions.