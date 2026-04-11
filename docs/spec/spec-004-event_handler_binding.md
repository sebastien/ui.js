# Event Handler Context Binding (`$.bind` / `$.run`)

## 1. Overview

Event callbacks often execute outside the original component context (for example, `window` listeners created by drag helpers).
When that happens, `Context.Get()` is undefined or wrong, and `slot.set(...)` updates do not target the intended instance context.

This spec introduces two context helpers on `$`:

- `$.bind(fn, ctx?)`: returns a function permanently bound to a context.
- `$.run(fn, ctx?, ...args)`: executes a function immediately in a context.

These APIs provide ergonomic and explicit context binding for deferred or external callbacks.

---

## 2. API

### 2.1 `$.bind(fn, ctx = Context.Get())`

Creates a wrapped function that always runs `fn` in `ctx`.

```js
const move = $.bind((event, data) => {
	position.set({ x: data.x, y: data.y });
});
drag(event, move);
```

Behavior:

- If `ctx` is omitted, current `Context.Get()` is captured at bind time.
- Wrapper preserves call-time `this` (`fn.apply(this, args)`).
- Wrapper accepts any argument list.
- If `ctx` is `undefined`, wrapper falls back to direct call (no context push/pop).
- Wrapper may carry metadata (e.g. `Symbol.for("ui.boundContext")`) for introspection/debugging.

---

### 2.2 `$.run(fn, ctx = Context.Get(), ...args)`

Runs `fn` immediately in `ctx`, forwarding args.

```js
$.run(
	(x, y) => position.set({ x, y }),
	ctx,
	nextX,
	nextY,
);
```

Behavior:

- If `ctx` is omitted, uses current `Context.Get()` at call time.
- If `ctx` is `undefined`, falls back to `fn(...args)`.
- Return value and thrown errors are preserved.
- Uses safe push/pop semantics via `Context.Run(...)` when context exists.

---

## 3. Semantics and Guarantees

- **Stack safety:** context stack is balanced even when callback throws.
- **No behavioral change for existing code:** additive API only.
- **Low overhead path:** if no context is provided, helper is near-zero abstraction.
- **Arg support:** both helpers support variadic arguments.

---

## 4. Reference Usage Patterns

### 4.1 External event source (drag)

```js
const onDragStart = (event) => {
	const move = $.bind((_event, { x, y }) => {
		position.set({ x, y });
	});
	drag(event, move);
};
```

### 4.2 One-shot contextual call

```js
const ctx = Context.Get();
$.run(() => {
	value.set(1);
	flag.set(true);
}, ctx);
```

### 4.3 Explicit context override

```js
const wrapped = $.bind(handler, specificContext);
window.addEventListener("mousemove", wrapped);
```

---

## 5. Implementation Notes

Proposed location: `src/js/ui/hyperscript.js` on `select`/`$` object.

- `select.bind = (fn, ctx = Context.Get()) => wrappedFn`
- `select.run = (fn, ctx = Context.Get(), ...args) => result`

Internally:

- Prefer `Context.Run(ctx, invoker, args)` when `ctx` exists.
- Fallback direct invocation when no context is available.

No breaking changes in `cells.js`, `effects.js`, or component API required.

---

## 6. Test Plan

Add or extend tests to validate:

1. `$.run` executes in explicit context and updates slots there.
2. `$.bind` captures current context by default.
3. `$.bind(fn, ctx)` uses provided context.
4. Wrapper forwards variadic args correctly.
5. Wrapper preserves `this` binding semantics.
6. Context stack remains balanced after throw.
7. Missing context path still executes function (fallback direct call).

Potential test file:

- `tests/unit-core-callback_passing.test.ts` (extend)
- or new `tests/unit-core-context_binding.test.ts`

---

## 7. Non-Goals

- No automatic retroactive binding of all callbacks.
- No replacement of existing `Context.Run`/`Context.Push`/`Context.Pop`.
- No change to event effect internals beyond optional adoption of helpers.

---

## 8. Migration

Existing code remains valid.

Recommended migration for external callbacks:

- Before: manually pass `context` to every `slot.set(value, force, context)`.
- After: bind once with `$.bind(...)`, then use regular `slot.set(...)` in handler body.

This improves readability and reduces context plumbing bugs.
