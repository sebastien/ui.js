# Incremental Rendering & Patching Spec (ui.js)

## 1. Overview

To support extremely fast incremental rendering, `ui.js` introduces a `patch` mechanism. Instead of fully replacing a data object and relying on VDOM diffing or top-down re-evaluations, patches describe exact mutations (e.g., adding an item to a list, changing a specific property, or splicing text).

By making the reactivity system (Cells/Observables and Effects) **patch-aware**, `ui.js` can route a patch directly to the affected DOM nodes in $O(1)$ time without iterating over unmodified sibling components.

## 2. The Patch Format (Optimized Internal Format)

The internal patch format is designed for maximum parsing performance in V8. It uses JavaScript types (Objects for traversal, Tuples/Arrays for operations, and a unique Symbol for removal) to avoid string parsing overhead during the render loop.

### 2.1. Removal (`Nothing`)
A special symbol `Symbol.for("Nothing")` indicates that a key or value should be removed.

### 2.2. Struct & Map Patches
A plain JavaScript object `{ [key]: patch }` traverses or patches the corresponding properties of the target object or map.
- `{ "name": ["set", "John"] }`: Updates the `name` property.
- `{ "age": Symbol.for("Nothing") }`: Deletes the `age` property.
- `{ "address": { "city": ["set", "Paris"] } }`: Traverses into `address` and updates `city`.

### 2.3. Operations (Tuples)
Operations are represented as Arrays where the first element is a string operation code.

#### Set
`["set", newValue]`
Completely replaces the target value with `newValue`.

#### List Mutations (Splice)
`["splice", index, deleteCount, ...items]`
Maps directly to `Array.prototype.splice`.
- `["splice", 1, 0, newItem]`: Inserts `newItem` at index 1.
- `["splice", 0, 5]`: Removes 5 items starting at index 0.

#### Text & String Mutations
`["text", index, deleteCount, insertString]`
Used to mutate string values directly, mapping to string slicing.
- `["text", 5, 0, " world"]`: Inserts " world" at index 5.
- `["text", 0, 4, ""]`: Deletes 4 characters at the start.

## 3. Developer Ergonomics (Patch Factory)

Developers will not write the internal tuple format directly. A `Patch` factory will be provided.

```javascript
import { Patch } from "ui.js";

// Structs & Maps
const patch1 = {
  id: "123",                    // Implicit "set" for primitive values
  status: true,
  oldKey: Patch.Nothing         // Removal
};

// Lists
const patch2 = {
  users: Patch.list.splice(1, 0, { id: 2, name: "Alice" }),
  // Aliases for convenience:
  // Patch.list.append(item)
  // Patch.list.remove(index, count)
};

// Text
const patch3 = {
  description: Patch.text.insert(5, " updated")
};
```

## 4. Execution Architecture

### 4.1. The Data Mutator
A core function `applyPatch(target, patchOp)` mutates the underlying JavaScript structure (Object, Array, Map) **in-place**. Performance is prioritized over immutability.

### 4.2. Patch-Aware Observables
`Slot` and `Observable` will expose a `patch(patchOp)` method.
1. It applies the patch to the raw data via `applyPatch`.
2. It increments the revision.
3. It broadcasts the change via `pubPatch(newValue, patchOp)` to all subscribed Effects.

### 4.3. Effect Interception (The "Super Optimization")
Effects will implement an optional `onPatch(patchOp)` handler to bypass standard re-rendering.

- **`MappingEffect`**: 
  - On receiving a structurally nested patch (e.g. `{ "item-1": subPatch }`), it retrieves the existing child context for `"item-1"` in $O(1)$ and calls `.patch(subPatch)` on the child's value slot. Sibling items are completely ignored.
  - On receiving a `["splice", ...]` patch, it maps the operation to DOM `insertBefore` and `removeChild`, updating its internal state map to shift indices accordingly.
- **`FormattingEffect`**: 
  - On receiving a `["text", ...]` patch, it slices the `node.data` directly without re-evaluating the formatter over the entire string.
- **`ApplicationEffect` / `ConditionalEffect`**: 
  - Will pass the patch through to their derived contexts so it can route to the deeper leaf nodes.
