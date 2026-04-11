# Task 002 - Keyed Array Mapping and Component State Preservation

## Goal

Add a keyed mapping mode for array rendering so list items keep stable component identity across insertions/removals/reordering, preserving local component cells (for example `isEdited`) and DOM-local state.

## Problem Statement

Current `MappingEffect` array handling is index-based. When an item is removed from the middle of an array, later items shift index and inherit the previous index context. This causes per-item component-local state to be reassigned or dropped.

Example: in `examples/app-todolist.example.html`, editing item #3, then removing item #2, causes item #3 to lose its edit state.

## Scope

1. Add keyed reconciliation for array mapping while keeping object/map mapping behavior unchanged.
2. Use automatic key inference when no explicit `keyBy` is provided.
3. Keep explicit `keyBy` support for full caller control.
4. Preserve non-keyed fallback semantics when no stable key can be inferred.

## Proposed API

Extend `Selection.map` to accept an optional key selector:

- Current: `items.map((valueSlot, indexSlot) => h(Row, { item: valueSlot }))`
- New (keyed): `items.map((valueSlot, indexSlot) => h(Row, { item: valueSlot }), (rawValue, rawIndex) => rawValue.id)`

Notes:

- The factory function receives `Selection` instances (slots).
- The key selector callback receives the *raw* values and indices.
- If no key selector is provided, default key inference is:
  - use `rawValue.id` when `rawValue` is object-like and has own `id`.
  - otherwise fallback to index-based behavior.
- Key selector should return a stable primitive key (`string` or `number` recommended).

## Implementation Plan

### 1) Extend Mapping Construction

- File: `src/js/ui/templates.js`
- Update `Selection.map` signature to `map(factory, keyBy = undefined)`.
- Pass `keyBy` into `MappingEffect` constructor.

### 2) Add Keyed Array Reconciliation in MappingEffect

- File: `src/js/ui/effects.js`
- Update `MappingEffect` constructor to store `keyBy`.
- In `render(...)`, split array path into two branches:
  - non-keyed fast path (existing index implementation, unchanged),
  - keyed path (explicit `keyBy` or inferred `id` keys).

For keyed array path:

- Maintain state in `context[this.id + Slot.State]` as:
  - `order`: previous key sequence,
  - `mapping`: `Map<key, ctx>`.
- For each render:
  1. Build new key sequence from current items.
  2. Reuse existing context by key when available.
  3. Create new context for new keys.
  4. Update `valueSlot` and `keySlot` in reused contexts with newest raw values.
  5. Render in new order so the DOM effector repositions existing nodes instead of remounting component instances.
  6. Unrender and delete contexts for keys no longer present.

### 3) Performance and Overhead Constraints

- Keep the index fast path exactly as-is and only enter keyed logic when explicit/inferred keys are available.
- Keep keyed reconciliation O(n) per render with no nested scans.
- Reuse arrays/objects where possible (`itemPos`, key order buffers) to avoid per-frame allocations.
- Preserve short-circuit behavior for unchanged values (`existing && Object.is(...)`) to skip unnecessary slot updates and rerenders.
- Reinitialize state once when switching between state shapes (index array vs keyed map) instead of converting incrementally.

### 4) Key Correctness and Safety Guards

- Detect duplicate keys within one render pass.
- On duplicate key:
  - warn via existing logging utility,
  - fall back to deterministic behavior (first occurrence keeps preserved context) without crashing.
- Keep keyed implementation resilient if `keyBy` returns `undefined` or `null`.

### 5) Example Update

- File: `examples/app-todolist.example.html`
- Keep list rendering explicitly keyed using `item.id`:
  - `ul(items.map((valueSlot, indexSlot) => h(TodoItem, { item: valueSlot, items, onRemove }), (rawValue) => rawValue.id))`

### 6) Regression Tests

- Add/update tests to verify keyed identity preservation:
  1. Add 3 items, enter edit mode on item #3, remove item #2, assert item #3 stays edited.
  2. Remove middle item and assert component-local state remains attached to same key.
  3. Auto-key inference (`rawValue.id`) works when `keyBy` is omitted.
  4. Fallback to index mode works when no usable key exists.
  5. Duplicate key warning path is deterministic and does not crash.

Potential location:

- Create a new dedicated test suite `tests/ui/mapping-keyed.test.js` specifically to test DOM node stability and local state preservation.

## Non-Goals

- No API changes to JSX key semantics outside of `Selection.map`.
- No large refactor of object/map branch logic.

## Acceptance Criteria

1. Keyed arrays preserve per-item component state through removal and reorder operations.
2. When `keyBy` is omitted, object items with `id` use keyed reconciliation by default.
3. Todo example bug is fixed using keyed mapping.
4. Lists without stable keys still work through index fallback.
5. Regression tests cover keyed preservation, inferred-key behavior, duplicate keys, and index fallback.

## Risks and Mitigations

- **Risk:** Duplicate/unstable keys produce confusing UI state.
  - **Mitigation:** Add warnings and document key stability expectations.
- **Risk:** Keyed path regresses list performance.
  - **Mitigation:** Keep old index fast path untouched and only use keyed logic when requested.
- **Risk:** Context state shape conflicts with prior array state.
  - **Mitigation:** Detect prior state shape and reinitialize keyed state safely.
