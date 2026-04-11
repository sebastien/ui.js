# Task 001 - Event Handler Returned-Object Updates

## Goal

Implement returned-object updates for event handlers so handlers can return payloads like `{ isEdited: true, value: "..." }`, while preserving strict component scoping rules and minimizing redundant rerenders.

## Scope Rules

1. Local component handlers execute in the closest component context.
2. Parent-provided handlers execute in the parent bound context.
3. Returned-object updates are applied in one and only one context:
   - Local handler: local component context.
   - Parent handler: strict bound parent context.
4. No dynamic context traversal fallback for returned-object keys.
5. Unknown keys are ignored.

## Implementation Plan

### 1) Context-Bound Callback Metadata

- In `src/js/ui/templates.js` (`Injection.applyContext`), when wrapping function values with `(...args) => Context.Run(context, v, args)`, attach metadata that stores the bound context.
- Use a symbol key to avoid collisions and keep metadata internal.
- Keep existing behavior for function invocation unchanged.

### 2) Event Handler Resolution and Update Context

- In `src/js/ui/effects.js` (`EventHandlerEffect`):
  - Keep resolving and invoking callbacks as today.
  - Detect whether the resolved callback carries bound-context metadata.
  - Choose update context as:
    - bound context if metadata exists,
    - otherwise current event context.
  - Remove parent-context traversal for returned-object mapping.

### 3) Named Slot Mapping (Per-Owner Cache)

- Keep per-owner cache for `name -> slot` mapping from component arguments.
- Use `Slot.Each(owner.args, ...)` to collect `Argument` slots that have a `name`.
- For each key in returned object:
  - if slot exists in selected update context, apply update,
  - otherwise ignore key.

### 4) Atomic Multi-Key Update

- Add batching support in `src/js/ui/cells.js`:
  - `Slot.Batch(context, fn)` entrypoint.
  - During batch, `Slot.Notify` records touched slot ids and defers subscriber dispatch.
  - At batch end, flush subscribers once per touched slot in deterministic order.
- Keep current derived-cell dirty-marking and microtask scheduling semantics.
- Use `Slot.Batch` in `EventHandlerEffect` when applying returned-object updates.

### 5) Tests

Update/add tests in `tests/unit-core-effects_terminal.test.ts`:

1. returned object updates local component slots.
2. returned object ignores unknown keys.
3. parent-provided handler updates parent bound context (strict).
4. multi-key returned object applies both keys in one batched update path.

Optional supporting test in callback-passing suite:

- ensure parent callback still executes in parent context with new metadata tagging.

## Notes

- This plan intentionally avoids changing user-facing API syntax.
- The batching mechanism should be minimal and additive so existing `.set(...)` behavior remains unchanged.
- If batching introduces edge-case ordering differences, preserve existing subscriber order within each slot and keep stable slot-id flush order.
