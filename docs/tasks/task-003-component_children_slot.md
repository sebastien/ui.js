# Task 003 - Component Children as Renderable Templates/Effects

## Goal

Support passing component templates/effects through `children` so wrapper components can render nested components structurally instead of stringifying them (for example `ComponentEffect(136)`).

## Problem Statement

When a component receives `children` and renders `{children}` directly, child values that are effects/templates can flow into a text-formatting path and be coerced to string. This produces output such as `ComponentEffect(136)` instead of mounting the nested component DOM.

## Scope

1. Ensure `children` values that are renderable (have `.render`) are rendered as structure, not text.
2. Keep primitive children behavior unchanged (text rendering still works).
3. Preserve ordering and fragment behavior for multiple children.
4. Avoid regressions in existing component, fragment, and mapping behavior.

## Implementation Plan

### 1) Introduce Render-Aware Child Handling

- File: `src/js/ui/hyperscript.js`
- Update `normalizeChildren` so Slot-based children are not always forced into `FormattingEffect`.
- Route child Slot values through a render-aware content path that:
  - renders structurally when resolved value is template/effect-like (`render` function),
  - falls back to text for primitives.
- The new handling must be fully reactive: if the slot's value changes from a VNode to text, or from one Component to another, it must correctly call `.unrender()` on the previous state to prevent DOM leaks. Consider aligning with or extracting the dynamic evaluation logic currently found in `Application.render`.

### 2) Normalize Component `props.children` Shape

- File: `src/js/ui/hyperscript.js`
- In the component branch of `createElement`, normalize `children` to a render-friendly shape:
  - no children -> `null` or empty value,
  - one child -> child value directly,
  - multiple children -> fragment aggregate (instead of raw nested arrays). When wrapping multiple children, explicitly use `h(Fragment, null, ...flattenedChildren)` to produce a single `VNode`. This guarantees the render pipeline only ever has to manage a single renderable entity.
- Keep argument injection API stable for existing component call sites.

### 3) Deep Child Flattening and Stability

- File: `src/js/ui/hyperscript.js`
- Ensure nested child arrays are flattened before normalization.
- Keep support for current child kinds: primitives, DOM nodes, VNodes, effects, and slots.
- Preserve stable child order across fragment and mixed-content scenarios.

### 4) Tests for Children Template/Effect Passing

- Add tests in `tests/unit-core-component.test.ts` (or adjacent focused suite):
  1. wrapper component renders a single component child passed via `children`.
  2. wrapper component renders multiple passed children in order.
  3. primitive children still render as text (no regression).
  4. mixed children (text + component/effect) render correctly.
  5. Scope preservation: wrapper component renders a child that references a reactive cell from the parent's scope (ensuring lexical scoping isn't broken by context traversal).

### 5) Regression Validation

- Run and validate existing relevant suites:
  - `tests/unit-core-component.test.ts`
  - `tests/unit-core-fragments.test.ts`
  - `tests/unit-core-effects_structural.test.ts`

## Acceptance Criteria

1. Passing `<Child />` as component `children` renders Child DOM, not effect string output.
2. Multiple children passed to wrappers preserve order and render correctly.
3. Existing primitive children behavior remains unchanged.
4. Fragment and component regression tests pass.

## Risks and Mitigations

- **Risk:** Changing children shape breaks assumptions in existing wrappers.
  - **Mitigation:** normalize with backward-compatible no/single/multiple semantics and add regression tests.
- **Risk:** Render-aware child handling interferes with fast text updates.
  - **Mitigation:** keep primitive fast path and only branch to structural rendering for renderable values.
- **Risk:** Nested arrays/fragments create path-target instability.
  - **Mitigation:** flatten deterministically and validate with fragment/path stability tests.
