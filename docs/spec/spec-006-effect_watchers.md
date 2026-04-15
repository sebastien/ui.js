# Effect Watchers (`$.effect` / `$.watch`)

## 1. Overview

This spec defines a lifecycle-scoped watcher primitive for UI.js.

Goals:
- Keep existing `$.effect(selection, handler, immediateBoolean)` behavior compatible.
- Add multi-dependency watcher ergonomics similar to `watch` APIs.
- Provide safe async defaults with latest-wins (`switch`) behavior.
- Keep context handling explicit and portable (common denominator runtime model).

This document supersedes `spec-006-selection_effect.md`.

## 2. API

### 2.1 Overloads

```js
// Existing (kept)
$.effect(selection, handler, immediateBoolean)

// New
$.effect(deps, handler, options)

// Alias
$.watch(deps, handler, options)
```

Where:
- `selection` / `deps` is one of:
  - `Slot`/`Selection`
  - `Slot[]`
  - plain object containing nested `Slot` values
- `handler(next, prev, api)` returns:
  - `void`
  - cleanup function
  - `Promise<void | cleanup function>`

### 2.2 Options

```js
{
  immediate?: boolean, // default false
  mode?: "switch",    // default "switch"
  context?: object      // default Context.Get()
}
```

`mode` is reserved for future expansion. This spec defines `switch` semantics.

### 2.3 Return value

`$.effect(...)` returns `stop()`, which:
- unsubscribes all dependency listeners
- aborts current async run (if any)
- runs pending cleanup

### 2.4 Backwards compatibility

Legacy call shape remains valid:

```js
$.effect(selection, handler, immediateBoolean)
```

Compatibility guarantees:
- `selection` still accepts a single `Slot`/`Selection`.
- boolean third argument still maps to `{ immediate: boolean }`.
- disposer behavior is unchanged (runs before rerun and on unmount).

## 3. Handler Inputs

- `next` is the expanded dependency value at trigger time.
- `prev` is the last committed dependency value, or `undefined` for immediate-first run.
- `api` exposes:
  - `signal`: `AbortSignal` for current run
  - `run(fn, ...args)`: executes `fn` in the watcher context
  - `bind(fn)`: returns context-bound function
  - `onCleanup(fn)`: registers per-run cleanup callback
  - `stop()`: stops this watcher

## 4. Semantics

### 4.1 Lifecycle scoping

Watcher registrations are stored in component/template derived context cleanup storage and are disposed on unmount.

### 4.2 Cleanup ordering

For each rerun:
1. previous run cleanup callbacks execute
2. previous async run is aborted
3. new handler executes

On stop/unmount, latest cleanup also executes.

### 4.3 Async mode: `switch`

Latest run wins:
- starting a new run aborts previous run signal
- stale async completions are ignored via run token checks
- only latest non-stale run may install its returned cleanup

### 4.4 Context model

The handler invocation is wrapped in the registration context.

Because browser async context is not universally available, post-`await` code that writes to context-sensitive `Cell` state should use `api.run(...)` (or use `$.signal`).

## 5. Compatibility

- Existing `$.effect(source, handler, true|false)` remains valid.
- Existing disposer behavior remains intact.
- Existing unmount cleanup integration remains intact.

## 6. Test Plan

Add/extend tests to validate:

1. Existing overload still works.
2. Array dependencies pass `[next]` and `[prev]`.
3. Object dependencies preserve shape.
4. Returned `stop()` unsubscribes and disposes.
5. Async `switch` latest-wins behavior (abort + stale guard).
6. `api.run(...)` enables safe post-`await` updates for context-sensitive `Cell` writes.
7. Unmount cleanup disposes active watchers.
