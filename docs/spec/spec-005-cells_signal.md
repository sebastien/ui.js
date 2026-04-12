# Context-Bound Signals (`$.signal`)

## 1. Overview

This spec introduces `$.signal(...)` as a context-bound state primitive built on top of `Cell`.

A signal is a `Cell` that carries a default bound context, so imperative reads and writes do not require `Context.Run(...)` or manual context threading.

Goals:
- Keep full `Cell` API ergonomics (`get`, `set`, `update`, `touch`, `sub`, `unsub`, etc.).
- Make signals fully interchangeable with cells in templates, effects, and derived graphs.
- Reduce context boilerplate for standalone or shared app state.

## 2. API

### 2.1 `$.signal(initial, context = [])`

Creates a signal initialized in a bound context.

```js
const count = $.signal(0);
count.get(); // 0
count.set(1);
count.get(); // 1
```

```js
const root = [];
const state = $.signal({ items: [] }, root);
```

### 2.2 Signal behavior

Signal instances expose the same API surface as `Cell`, but default all context-sensitive operations to `signal.context` when no context is provided.

Expected methods and properties:
- `get()`
- `set(value, force = true, context = signal.context)`
- `update(patch, context = signal.context)`
- `touch(context = signal.context)`
- `observable(context = signal.context)`
- `sub(handler, context = signal.context)`
- `unsub(handler, context = signal.context)`
- `value` getter and setter

Explicit context override remains supported where applicable.

## 3. Semantics and Guarantees

- Cell compatibility: `Signal` is a `Selection` and `Slot` subtype and can be used anywhere a `Cell` is accepted.
- Default context binding: no ambient `Context.Get()` is required for normal imperative operations.
- Explicit override wins: passing a `context` argument uses that context instead of the bound default.
- No behavior breakage: `$.cell(...)` semantics remain unchanged.
- Derivation compatibility: signals can participate in derived shapes like regular cells.

## 4. Reference Usage Patterns

### 4.1 Local standalone state

```js
const text = $.signal("");
text.set("Hello");
```

### 4.2 Shared explicit root context

```js
const root = [];
const todos = $.signal([], root);
const nextId = $.signal(1, root);
```

### 4.3 Interop with derived cells

```js
const a = $.signal(2);
const b = $.cell({ a }, ({ a }) => a * 2);
```

### 4.4 Override bound context when needed

```js
const a = $.signal(1, ctxA);
a.set(9, true, ctxB);
```

## 5. Implementation Notes

- Add `select.signal = (initial, context = []) => Signal`.
- Add `Signal` type (recommended: extend `Cell`) with stored `context`.
- Ensure signal initializes observability and value in its bound context at creation time.
- Preserve existing slot ids, notification flow, and scheduler behavior.
- Keep derived cell internals unchanged; compatibility should come from inheritance and protocol adherence.

## 6. Test Plan

Add `tests/unit-core-signal.test.ts` covering:

1. Creates signal with internal default context.
2. `get`, `set`, `update`, and `touch` work without `Context.Run`.
3. `sub` and `unsub` operate in bound context by default.
4. Explicit context override works for write and read paths where applicable.
5. Signal interoperates with `$.cell({ ... }, processor)` derived shapes.
6. Signal works in template bindings and effects the same way as `Cell`.
7. Signal and `Cell` can coexist across multiple contexts without cross-talk.

## 7. Non-Goals

- No deprecation of `$.cell(...)`.
- No automatic migration of all cells to signals.
- No change to `Context` stack model.
- No dynamic dependency tracking changes.

## 8. Migration

Before:

```js
const value = $.cell(0);
const ctx = [];
Context.Run(ctx, () => {
  value.observable(ctx);
  value.set(1);
});
```

After:

```js
const value = $.signal(0);
value.set(1);
```

For shared context scenarios:

```js
const value = $.signal(0, sharedContext);
```
