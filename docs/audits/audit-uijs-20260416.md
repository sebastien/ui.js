# ui.js Performance & Architecture Audit

**Date:** 2026-04-16
**Scope:** Full codebase audit (src/js/ui/), tests/, benchmarks/, docs/
**Compared against:** React 19, SolidJS 1.x

---

## 1. Architecture Summary

ui.js is a ~14-file, zero-dependency, fine-grained reactive rendering library.
The architecture is layered:

```
Public API (ui.js, hyperscript.js)
  -> Templates (templates.js)    -- component model, context injection
    -> Effects (effects.js)      -- reactive DOM bindings (text, attrs, conditionals, lists, events)
      -> VDom (vdom.js)          -- template materialisation, clone-and-patch
        -> Effectors (effectors.js)  -- low-level DOM mutations
  -> Cells (cells.js)            -- reactive state primitives, dependency graph, scheduling
```

### Module Map

| Module | File | Lines | Role |
|--------|------|-------|------|
| Entry | `src/js/ui.js` | ~10 | Re-exports public API |
| Client | `src/js/ui/client.js` | ~88 | `render()`, `globals`, mount/dispose |
| Cells | `src/js/ui/cells.js` | ~900 | `Slot`, `Observable`, `Context`, derivation graph |
| Templates | `src/js/ui/templates.js` | ~500 | `Cell`, `DerivedCell`, `Signal`, `Selection`, `Injection`, `Application` |
| Effects | `src/js/ui/effects.js` | ~1100 | `TemplateEffect`, `ComponentEffect`, `ConditionalEffect`, `MappingEffect`, `FormattingEffect`, `AttributeEffect`, `EventHandlerEffect`, `RefEffect` |
| Hyperscript | `src/js/ui/hyperscript.js` | ~500 | `h` proxy, `$` API, `createElement`, attribute/child normalisation |
| VDom | `src/js/ui/vdom.js` | ~400 | `VNode`, template materialisation, effect target resolution |
| Effectors | `src/js/ui/effectors.js` | ~150 | `DOMEffector` -- insert, replace, remove, text |
| FastDom | `src/js/ui/fastdom.js` | ~163 | Read/write batching scheduler (available but not integrated) |
| Web Components | `src/js/ui/webcomponents.js` | ~260 | `webcomponent()` factory, Shadow DOM, attribute binding |
| JSX | `src/js/ui/jsx.js` | - | JSX runtime (`jsx-runtime` / `jsx-dev-runtime`) |
| Icons | `src/js/ui/icons.js` | - | `<ui-icon>` custom element |
| Interaction | `src/js/ui/interaction.js` | ~313 | Drag, resize, keyboard interaction utilities |
| Markup | `src/js/ui/markup.js` | ~306 | HTML template parsing, SSR bridge (`<template>` directives) |
| Utilities | `src/js/ui/utils/*.js` | - | DOM helpers, logging, types, collections, text, inspect |

### Public API Surface

| Export | Source | Purpose |
|--------|--------|---------|
| `render` / `ui` | `client.js` | Mount a component to a DOM node |
| `globals` | `client.js` | Shared effector/context defaults |
| `h` | `hyperscript.js` | Hyperscript element builder (`h.div(...)`) |
| `$` | `hyperscript.js` | Reactive API (`$.cell`, `$.effect`, `$.signal`, `$.bind`, `$.run`, `$.send`, `$.get`) |
| `select` | `hyperscript.js` | Reactive DOM selections |
| `webcomponent` | `webcomponents.js` | Register custom elements wrapping ui.js components |

---

## 2. Key Design Decisions

| Decision | Approach | Trade-off |
|----------|----------|-----------|
| **State model** | Context-centric -- state lives in external arrays, not inside Slot objects | Enables multi-instance reuse; harder to inspect/debug |
| **Memory layout** | Stride-of-6 integer-indexed context arrays exploiting V8 holey-elements (~8 bytes/entry vs ~80 for named props) | ~1.8 MB savings in large apps; tightly coupled to V8 internals |
| **Rendering** | Template-clone-and-patch (no VDOM diff tree walk) | Minimal overhead for static structure; effects handle dynamic parts |
| **Reactivity** | Fine-grained slot-based pub/sub with static dependency declaration | Precise updates, no tracking overhead; requires upfront dep declaration |
| **Scheduling** | Synchronous effect re-render + microtask-batched derived cell evaluation | Immediate consistency; risk of layout thrashing |
| **Events** | Direct `addEventListener` per element (not delegation) | Simple, Shadow-DOM-friendly; more listeners in large lists |
| **Context chain** | Prototype-chained arrays (`Object.create(parentCtx)`) | Zero-copy inheritance; complex debugging |
| **Lists** | Dual keyed/unkeyed with Map lookup; no move detection | Simple reconciliation; suboptimal for reorders |
| **Templates** | Cached DOM clones with placeholder nodes | Fast instantiation; memory cost of template cache (no eviction) |
| **Cleanup** | Explicit `unrender` chain per effect type | Complete cleanup; requires discipline at every level |

---

## 3. Strengths

### 3.1 Reactive System

- **Rank-sorted derived evaluation**: Diamond dependency problem solved via
  topological rank. `FlushPending()` sorts by rank, ensuring correct
  evaluation order. Confirmed by test `unit-cells-derived.test.js:16-48`.

- **Pull-through stale prevention**: `slot.get()` triggers synchronous
  `FlushDerived()` -- recursive depth-first flush of all dirty deps.
  Synchronous reads are always consistent.

- **Cycle detection at creation time**: `Slot.HasPath()` performs DFS before
  registering a derivation. Cycles throw immediately, never silently corrupt
  the graph.

- **Async race handling**: Global `Slot.Cycle` counter tags each evaluation.
  Stale promise resolutions are silently discarded when cycle numbers don't
  match. Simple and correct.

- **Hybrid push-pull**: Dirty flags propagate eagerly (push) via
  `MarkDependentsDirty()`, but lazy derivations only evaluate on demand
  (pull). Best of both worlds.

- **WeakMap-backed per-context state**: `PendingByContext`,
  `BatchDepthByContext`, `BatchedNotificationsByContext` are all WeakMaps --
  contexts can be GC'd without manual cleanup of these maps.

### 3.2 Rendering Pipeline

- **Template cloning**: `cloneNode(true)` on a pre-built DOM template gives
  O(1) DOM creation for repeated components. The template is materialised
  lazily on first access and cached on the VNode.

- **Two-phase effect resolution** (`vdom.js`): All effect targets are resolved
  *before* any effect executes. This prevents DOM mutations from one effect
  invalidating the position of subsequent effects.

- **Component skip optimisation** (`ComponentEffect`): Pre-computes a flat
  array of extraction slot IDs. On re-render, compares values via
  `Object.is()` -- O(props) check avoids O(tree) re-render. Falls back to
  `isShallowEqual` if no extraction slots.

- **DocumentFragment initial mount** (`client.js`): First render builds into
  a `DocumentFragment`, then appends in one shot. Avoids incremental
  insertions.

- **Per-effect change detection**: Each effect independently decides whether
  to update -- `FormattingEffect` uses `Object.is`, `AttributeEffect` uses
  token-based staleness, `MappingEffect` uses per-item comparison.

### 3.3 Architecture

- **Zero dependencies**: The core library has no runtime dependencies.
  `terser` is a build-time-only dep.

- **No build step**: Native ESM. Runs directly in the browser without
  bundling. Excellent for prototyping and debugging.

- **Benchmark infrastructure**: The `bench:inspector` suite compares ui.js
  against Preact and SolidJS on the same workload (recursive JSON tree
  viewer) with DOM snapshot verification via FNV-1a hashing. Heap memory is
  measured via CDP. This is a solid methodology.

---

## 4. Comparison with React and Solid

### 4.1 Reactivity Model

| Concern | React | Solid | ui.js | Gap |
|---------|-------|-------|-------|-----|
| Dependency tracking | Manual (deps arrays) | Automatic (signal reads tracked) | Static (declared shapes) | Static shapes require upfront declaration. Missing a dep silently produces stale values. Auto-tracking is safer. |
| `set()` equality check | N/A (immutable model) | `set()` uses equality check by default | `set(val, force=true)` -- force by default | Every `set()` triggers notification even with same value. Opposite of React/Solid convention. Causes unnecessary downstream re-renders. |
| Error boundaries | `ErrorBoundary` component | `ErrorBoundary` component | None -- errors logged, previous value retained | No error boundary mechanism. Failing derivation silently produces stale data downstream. No recovery, fallback, or component stack trace. |
| Suspense / async coordination | `Suspense` + `use()` | `Suspense` + `createResource` | Per-effect promise handling (token-based) | No coordinated loading state. Each effect handles promises independently. |
| Transitions | `useTransition`, `startTransition` | `startTransition` | None | No way to mark updates as non-urgent or keep stale UI during async work. |
| Context provider/consumer | `createContext` / `useContext` | `createContext` / `useContext` | Prototypal context chain | No explicit Context API. Data flows via prototype chains -- works but is opaque and difficult to debug. |

### 4.2 Rendering Pipeline

| Concern | React | Solid | ui.js | Gap |
|---------|-------|-------|-------|-----|
| DOM update batching | Automatic (within event handlers; `flushSync` for escape) | Automatic (batched into microtask) | Synchronous per slot change unless explicit `Slot.Batch()` | No automatic DOM batching. Rapid slot changes cause synchronous DOM mutations. FastDOM exists but is not wired into the core loop. |
| List reconciliation | Full keyed reconciliation with move detection | Keyed with optimised reconciliation (Ivi-based LIS) | Keyed = Map lookup, no move detection; unkeyed = positional | No move optimisation. Reordering N items triggers N content updates instead of N DOM moves. |
| Concurrent rendering | Fiber architecture, time-slicing | N/A (fine-grained avoids the need) | N/A | Not a gap per se -- fine-grained updates avoid the need. But no way to interrupt a long initial render. |
| SSR / Hydration | `renderToString` + `hydrateRoot` | `renderToString` + `hydrate` | Partial: `markup.js` parses HTML templates; no `hydrate()` API | Incomplete SSR story. Template directives partially implemented. No `renderToString` or `hydrate()`. |
| Streaming SSR | `renderToPipeableStream` | `renderToStream` | None | No streaming SSR. |

### 4.3 Developer Experience

| Concern | React | Solid | ui.js | Gap |
|---------|-------|-------|-------|-----|
| DevTools | React DevTools (component tree, profiler, state) | Solid DevTools | `utils/inspect.js` only, no browser extension | No DevTools integration. Context-array model is particularly hard to inspect. |
| TypeScript | Full `.d.ts` type definitions | Full types | JSDoc/inline only, no `.d.ts` | No published type definitions. TS consumers get no autocomplete or checking. |
| Error messages | Detailed with component stacks | Detailed | `onError` logs to console | No component stack traces on error. |
| HMR | Via bundler plugins | Via bundler plugins | None | State lost on page reload during development. |
| Documentation | Extensive | Extensive | `docs/quickstart.md` + a few refs | Minimal. No API reference, cookbook, or migration guide. |

### 4.4 Ecosystem & Patterns

| Pattern | React | Solid | ui.js | Gap |
|---------|-------|-------|-------|-----|
| Portals | `createPortal` | `Portal` | None | Cannot render into a different DOM subtree. |
| Routing | React Router, TanStack | Solid Router | None | No routing. Not in scope for a rendering lib, but worth noting. |
| Animation | `framer-motion`, `react-spring` | `solid-transition-group` | None | No enter/exit transitions for conditionals or list items. |
| Testing utilities | `@testing-library/react` | `@solidjs/testing-library` | `test-utils.ts` (internal only) | No public testing library for consumers. |
| Form handling | Controlled/uncontrolled patterns | Native forms + signals | `EventHandlerEffect` return-value shorthand | The return-value-based update is clever but undocumented and non-obvious. |

---

## 5. Performance Concerns

### 5.1 Critical (P0 -- Likely Causing Measurable Slowdowns)

#### 5.1.1 Synchronous Effect Re-rendering

Effects re-render immediately on every `Slot.Notify()` call. A chain of N
slot mutations in a single synchronous block causes N separate DOM mutation
passes. React and Solid both batch these automatically.

**Where**: `effects.js`, `Effect.subrender()` -- subscribes a re-render
callback directly to the input slot.

**Impact**: Layout thrashing in code that updates multiple slots in sequence
without an explicit `Slot.Batch()` wrapper.

**Recommendation**: Integrate `FastDOM.mutate()` into effect re-rendering,
or adopt Solid's approach of batching all DOM mutations into a single
microtask. `fastdom.js` already exists in the codebase but is not wired
into the core render loop.

#### 5.1.2 Default `force=true` on `set()`

`slot.set(value, force = true)` triggers notification regardless of value
equality. This is the opposite of React/Solid convention and causes
unnecessary downstream re-renders for every assignment, even no-ops.

**Where**: `cells.js`, `Slot.prototype.set()` -- `force` parameter defaults
to `true`.

**Impact**: Every `slot.set(x)` where `x === currentValue` still triggers
subscriber notification and derived cell re-evaluation.

**Recommendation**: Default `force` to `false`. Use `Object.is()` as the
default equality check, matching Solid's behavior. Provide `.touch()` or
explicit `force=true` for the rare case where notification without change
is needed (which already exists).

#### 5.1.3 No List Move Detection

Keyed list reconciliation uses a Map for O(1) key lookup but does not
detect moves. When items are reordered, each item's content is updated
in-place at its current DOM position rather than physically moving DOM
nodes.

**Where**: `effects.js`, `MappingEffect._renderArrayKeyed()`.

**Impact**: For a 1000-item list where one item moves from position 0 to
999, all 1000 items are re-evaluated. Solid uses an Ivi-based LIS
(Longest Increasing Subsequence) algorithm to minimise DOM moves.

**Recommendation**: Implement a minimal LIS-based algorithm for computing
DOM node moves, similar to Solid, Inferno, or Vue 3.

### 5.2 Moderate (P1 -- Potential Issues at Scale)

#### 5.2.1 `Slot.Unsub` Linear Splice

Subscriber removal uses `Array.splice()`, which is O(n) on the subscriber
array length. For slots with many subscribers (e.g., a shared context
value consumed by 100+ components), this adds up during bulk unmount.

**Where**: `cells.js`, `Slot.Unsub()`.

**Recommendation**: Consider a Set-based subscriber store, or swap-with-last
+ pop for O(1) removal (if ordering doesn't matter).

#### 5.2.2 Injection Re-matching on Every Re-render

`Injection.applyContext` re-runs `Slot.Match` on every re-render to detect
input changes. The match result is cached, but the matching itself
iterates all argument slots.

**Where**: `templates.js`, `Injection.applyContext()`.

**Impact**: O(props) per re-render. For components with 20+ props, this is
non-trivial overhead.

**Recommendation**: Dirty-flag the injection input and skip re-matching
when no input has changed.

#### 5.2.3 Global Mutable State Prevents SSR

`Slot.Id`, `Slot.Cycle`, `Slot.Pending`, `Slot.FlushQueued`, and
`Context.Stack` are all process-global singletons.

**Where**: `cells.js`, module-level variables.

**Impact**: SSR in a shared Node.js process is unsafe -- concurrent
requests would collide on the global context stack and pending queue.

**Recommendation**: Scope all globals into a rendering root/context object
that is created per `render()` call or per request.

#### 5.2.4 Fragment Child Array Allocation

`Array.from(node.childNodes)` on every fragment mount creates a fresh
array that becomes garbage immediately after use.

**Where**: `vdom.js`, fragment handling paths.

**Recommendation**: Pool or reuse the array. For hot paths, a pre-allocated
buffer with manual length tracking avoids GC pressure.

### 5.3 Minor (P2 -- Low Priority)

#### 5.3.1 `getSignature` String Parsing

`Function.prototype.toString()` is parsed to extract component argument
names. This runs once per component type (cached on the function object).

**Where**: `templates.js`, `getSignature()`.

**Impact**: Low -- one-time cost. But fragile: minifiers that rename
parameters will break it.

**Recommendation**: Document the limitation. Consider a declarative
alternative (e.g., a static `args` property on component functions).

#### 5.3.2 Template Cache Has No Eviction

Each unique VNode tree caches a materialised DOM template. In an app with
many unique templates, memory grows linearly.

**Where**: `vdom.js`, `VNode._template` (lazy, cached).

**Impact**: Low in practice. Only a concern for apps that dynamically
generate many unique template shapes (uncommon).

---

## 6. Possible Bug: `Slot.Expand` Missing Return for Map

**File**: `cells.js`, approximately line 195-198.

```js
} else if (template instanceof Map) {
    const res = new Map();
    for (const [k, v] of template.entries()) {
        res.set(k, Slot.Expand(v, context));
    }
    // BUG: Missing `return res;` -- falls through to `return template;`
}
```

The `Map` branch computes an expanded result (`res`) but never returns it.
The function falls through to the final `return template`, returning the
unexpanded original Map. This should be `return res`.

---

## 7. Test Coverage Analysis

### 7.1 Coverage Summary

| Category | Count | Description |
|----------|-------|-------------|
| Unit tests | 15 | Core primitives, effects, components, reactivity, signals, fragments |
| Bug regressions | 12 | Specific bugs with reproduction cases |
| Case/integration | 5 | Full scenarios (todolist, color palette, rich text, data table, forms) |
| Infrastructure | 4 | test-utils, case-runner, case-harness, case-mount |
| **Total** | **36** | |

### 7.2 Well-Tested Areas

- Derived cell mechanics (diamond DAG, cycle detection, async race, lazy eval, stale reads)
- Terminal effects (formatting, attributes, events, lifecycle, refs)
- Structural effects (conditionals, mapping, templates)
- Cell overloads and API variants
- Context binding (`$.bind`, `$.run`, `$.send`)
- Keyed list reconciliation (explicit keyBy, auto-id, index fallback, duplicate keys)
- Fragment lifecycle and path stability
- Component children passing and slot scoping
- Cleanup and disposal (event listeners, `$.effect` disposers, conditionals, idempotent unmount)

### 7.3 Untested Modules

| Module | Coverage | Risk |
|--------|----------|------|
| **`webcomponents.js`** | Zero tests | **High** -- Shadow DOM, attribute binding, lifecycle, slot change, disconnect cleanup all untested |
| **`jsx.js`** | Zero tests | Medium -- JSX runtime exported in package.json but never tested |
| **`vdom.js`** | Indirect only | Medium -- template materialisation, effect target resolution, cache invalidation have no unit tests |
| **`client.js`** | Indirect only | Medium -- `render()`, `dispose()`, parameter extraction untested directly |
| **`markup.js`** | Zero tests | Medium -- HTML template parsing, SSR bridge untested |
| **`fastdom.js`** | Zero tests | Low -- standalone utility, not integrated into core |
| **`interaction.js`** | Zero tests | Low -- utility module |
| **`icons.js`** | Zero tests | Low -- `<ui-icon>` custom element untested |

### 7.4 Untested Patterns

| Pattern | Detail |
|---------|--------|
| Error paths | No tests for invalid shapes, missing context, processor failures, or error recovery |
| Promise rejection | Promise resolution tested, but `.catch()` paths in `FormattingEffect` and `AttributeEffect` untested |
| Dynamic component swap | `DynamicComponentEffect` tested for initial mount but not runtime component swapping |
| Nested fragments | Single-level fragments tested, not fragment-in-fragment |
| Large lists | Keyed mapping tested with 3-item lists; 100+ item behavior untested |
| Concurrent renders | No tests for multiple `render()` calls targeting the same root |
| SSR / no-DOM | No tests for graceful degradation when DOM APIs are unavailable |

---

## 8. Benchmarks

### 8.1 Inspector Benchmark (`npm run bench:inspector`)

Compares ui.js against Preact and SolidJS using identical workloads:

- **Workload**: Recursive JSON tree viewer (`Inspector` component) rendering
  a deeply nested data structure
- **Measures**: Initial render (ms), patch phases (content/move/type/add-remove),
  heap memory (before/peak/after/delta via CDP)
- **Verification**: DOM snapshots compared via FNV-1a hash to ensure equivalent
  output across frameworks
- **Runs**: 5 repetitions per framework, with rAF-settled timing

### 8.2 Case Benchmarks (`npm run bench:cases`)

Measures 5 application scenarios (todolist, color palette, rich text, data
table, form validation):

- **Measures**: `mount_time_ms`, `interaction_total_ms`, `mount_p95_ms`,
  `interaction_p95_ms`, `dom_nodes_before`, `dom_nodes_after`
- **Runs**: 8 repetitions per case

### 8.3 Benchmark Gaps

- No micro-benchmarks for individual operations (cell creation, slot set,
  derived evaluation, subscriber management)
- No benchmark for list reordering specifically (the inspector benchmark
  covers array swaps but not large-scale reordering)
- No memory leak detection benchmark (long-running mount/unmount cycles)

---

## 9. Recommended Priorities

### P0 -- Critical Performance

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 1 | Automatic DOM update batching -- integrate FastDOM or microtask batching into effect re-render | Eliminates layout thrashing from rapid slot updates | Medium |
| 2 | Default `set()` force to `false` -- use `Object.is()` equality check | Eliminates unnecessary downstream re-renders | Low |
| 3 | List reconciliation with move detection -- LIS-based algorithm | Enables efficient list reordering for large datasets | Medium |

### P1 -- Correctness & Reliability

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 4 | Error boundaries -- catch/recover mechanism for component subtrees | Prevents silent stale data from failing derivations | Medium |
| 5 | Fix `Slot.Expand` Map bug -- add missing `return res` | Correctness fix for Map-type template expansion | Trivial |
| 6 | Web component test coverage -- Shadow DOM, attributes, lifecycle, cleanup | Prevent shipping broken custom element support | Medium |
| 7 | Subscriber notification ordering -- consider rank-based ordering for direct `Slot.Sub` callbacks, or document the caveat | Prevents subtle ordering bugs when subscribers read sibling derived values | Low-Medium |

### P2 -- Developer Experience

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 8 | TypeScript type definitions (`.d.ts`) | Enables autocomplete and type checking for consumers | Medium |
| 9 | Scope global mutable state for SSR safety | Unblocks server-side rendering in shared processes | Medium |
| 10 | SSR: `renderToString()` + `hydrate()` APIs | Enables server-side rendering use cases | High |
| 11 | DevTools / debug tooling | Enables inspection of reactive graph and component tree | High |
| 12 | JSX runtime test coverage | Validates the exported `jsx-runtime` works correctly | Low |

### P3 -- Feature Parity

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 13 | Portals (render into different DOM subtree) | Enables modals, tooltips, dropdowns at body level | Low |
| 14 | Suspense / async coordination | Coordinated loading states for async data | High |
| 15 | Animation primitives (enter/exit transitions) | Enables smooth conditional and list animations | Medium |
| 16 | Auto-tracking option for dependencies | Reduces DX friction for developers used to Solid/Vue | High (architectural) |

---

## 10. Summary

ui.js is a well-engineered, performance-conscious library with several
genuinely novel design choices (context-array memory layout, two-phase
effect resolution, template-clone-and-patch rendering). The reactive
system is sound, with correct diamond-dependency handling and stale-read
prevention.

The primary gaps fall into three categories:

1. **Performance defaults** -- synchronous effect re-rendering, force-true
   on set(), and lack of list move detection leave performance on the table
   in common real-world patterns. These are the highest-leverage fixes.

2. **Robustness** -- no error boundaries, no Suspense, global mutable state
   preventing SSR, and significant test coverage gaps (especially web
   components) are the main reliability risks.

3. **DX** -- no TypeScript types, no DevTools, minimal documentation, and
   static dependency declaration (vs auto-tracking) create friction for
   adoption.

The existing benchmark infrastructure is a strong foundation for validating
that performance fixes don't regress. The recommended approach is to
address P0 performance items first (they have the best impact-to-effort
ratio), then P1 correctness items, before tackling the larger DX and
feature-parity work.

<!-- EOF -->
