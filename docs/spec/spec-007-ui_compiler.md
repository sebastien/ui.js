# Specification: UI Compiler (`uic`)

## 1. Objective
Introduce a build-time compiler (`src/js/uic/`) for `ui.js` that transforms JSX into highly optimized, monomorphic JavaScript. The goal is to achieve significant (>25%) performance gains and reduce memory footprint at runtime by bypassing the virtual DOM, runtime hyperscript parsing, and generic DOM effectors wherever possible. 

The compiler shifts the burden of structural analysis to build-time, producing direct DOM mutations driven by the existing `effect` and `cells` reactivity primitives.

## 2. Core Principles
*   **No Runtime Dependencies:** The compiler operates entirely at build time. The compiled output relies exclusively on the existing `ui.js` primitives (`effect`, `cells`).
*   **Opt-in Build Step:** `ui.js` remains a fundamentally "no-build" library. The compiler is an optional enhancement for projects needing maximum performance.
*   **Graceful Degradation:** The compiler optimizes statically analyzable DOM structures. Complex, highly dynamic structures (e.g., spread props, dynamic tags) safely fall back to the existing runtime `h()` function.
*   **Minimal Footprint:** Uses lightweight AST tooling (Acorn ecosystem) instead of heavy toolchains like Babel.

## 3. Architecture & Location
The compiler will be implemented as a standalone module located in `src/js/uic/`.

```text
src/js/uic/
├── cli.js           # CLI entrypoint for standalone execution
├── index.js         # Core programmatic API `compile(source)`
├── runtime.js       # Runtime helper used by compiled output
├── parser.js        # Acorn JSX parser integration
├── transform.js     # AST traversal and mutation logic
└── generator.js     # Code generation
```

### Dev Dependencies (Build-time only)
*   `acorn`: Core JavaScript parser.
*   `acorn-jsx`: JSX plugin for Acorn.
*   `estree-walker`: Lightweight AST traversal.
*   `astring`: Fast ESTree-to-JavaScript code generator.

## 4. Compilation Pipeline

### Phase 1: Parsing
`acorn` and `acorn-jsx` parse the source file into an ESTree-compliant Abstract Syntax Tree (AST) containing `JSXElement` and `JSXFragment` nodes.

### Phase 2: Transformation & Extraction
The `estree-walker` traverses the AST. When it encounters JSX elements, it determines if they can take the "Fast Path" or must use the "Bailout Path".

#### A. Fast Path (Statically Analyzable, Performance-Critical)
Applied to standard HTML elements (`<div>`, `<span>`, etc.) without dynamic spreads or dynamic tag names.

The key requirement is: **do not parse template strings at runtime**.

1. **Static Extraction:** Build-time extraction of static structure and dynamic holes.
2. **Descriptor Generation:** Emit a compact descriptor with:
   - static node layout,
   - direct child-index paths to dynamic targets,
   - binding opcodes (`text`, `attr`, `event`),
   - static attribute payload.
3. **Hoisted Allocation:** Emit module-level constants once per compiled subtree.
4. **Runtime Execution:** `ui/uic/runtime` executes descriptors directly (DOM create/clone + targeted updates), without converting through `h(...)`.
5. **Binding Specialization:** Generate stable per-binding handlers and avoid re-allocating closures on each render/update.

#### B. Bailout Path (Dynamic & Complex)
Applied when static optimization is unsafe or impossible:
*   **Custom Components:** `<Counter count={1} />` translates to a standard function call or boundary instantiation.
*   **Spread Attributes:** `<div {...props}>` falls back to `h("div", props)` because `props` might contain structural changes or events that the compiler cannot foresee.
*   **Dynamic Tags:** `<Tag />` falls back to `h(Tag, ...)`.

### Phase 3: Code Generation
`astring` takes the mutated AST and outputs standard JavaScript.

### Phase 4: Runtime Descriptor Execution
`src/js/uic/runtime.js` exposes a low-level executor. It must:
- instantiate static structure from hoisted descriptor data,
- resolve target nodes using precomputed index paths,
- apply updates with minimal branching,
- reuse existing reactive primitives/effects where beneficial, but avoid runtime HTML parsing and `h(...)` reconstruction for fast-path components.

## 5. Descriptor Contract (Draft)

For each compiled JSX subtree, the compiler emits:

```js
const _uic0 = createDescriptor({
  root: [
    // static node tree and attrs
  ],
  paths: {
    t0: [0, 1, 0],
    n0: [0],
  },
  bindings: [
    { kind: "text", target: "t0", get: () => count },
    { kind: "attr", target: "n0", name: "id", get: () => id },
    { kind: "event", target: "n0", name: "onClick", get: () => onClick },
  ],
});
```

Runtime operations:
- `mount(descriptor, parent, position, context, effector)`
- `update(instance, context)`
- `unmount(instance, context, effector)`

Implementation note: helper naming is illustrative; final API can align with existing effect/template interfaces.

## 6. Updated Example (Target Shape)

### Input (JSX)
```jsx
import { effect } from "./ui/cells.js";

export function Counter(cells) {
  return (
    <div class="counter" id={cells.id}>
      <h1>Counter</h1>
      <span>Count: {cells.count}</span>
      <button onClick={cells.increment}>+1</button>
    </div>
  );
}
```

### Output (Compiled JS)
```javascript
import { createDescriptor, mountDescriptor } from "ui/uic/runtime";

const _counter = createDescriptor({
  // simplified illustrative payload
  bindings: [
    { kind: "attr", target: "n0", name: "id", get: () => cells.id },
    { kind: "text", target: "t1", get: () => cells.count },
    { kind: "event", target: "n2", name: "onClick", get: () => cells.increment },
  ],
});

export function Counter(cells) {
  return mountDescriptor(_counter, cells);
}
```

## 7. Integration and CLI
The compiler is invoked via a lightweight CLI script, adhering to standard Unix input/output pipes or file arguments:
```bash
node src/js/uic/cli.js src/components/app.jsx > dist/app.js
```
The programmatic API (`compile`) is exposed for future integration into bundler plugins (Vite, Rollup, Bun).

## 8. Benchmarking and Acceptance Criteria

### Baseline Tracking
- `bench:inspector` must include `ui` and `uic`.
- Results are saved in `tests/data/benchmark-inspector-<timestamp>.json`.
- Each run reports delta versus the latest prior inspector snapshot.

### Correctness Gate
- Snapshot verification for `ui` and `uic` must pass before performance claims are accepted.

### Performance Gate (target)
- `uic` must demonstrate consistent patch-time improvement versus `ui` across multiple runs (`--runs >= 5`).
- Target range: **10-25% reduction in patch script time** for inspector workload.

### Instrumentation Requirement
- Add internal timing counters for runtime phases (descriptor mount/update/unmount) to verify wins come from removing runtime parse/rebuild overhead rather than benchmark noise.

## 9. Implementation Checklist (Execution Plan)

### Phase 1 - Hoisted Compiled Artifacts
- [ ] Transform JSX fast-path to emit **module-level** compiled constants (no inline `compiled(...)` in render flow).
- [ ] Reuse hoisted constants in component return paths.
- [ ] Keep bailout nodes on runtime `h(...)`.

### Phase 2 - Descriptor Runtime API
- [ ] Introduce descriptor payload generation in compiler output.
- [ ] Add runtime executor in `src/js/uic/runtime.js` for descriptor mount/update/unmount.
- [ ] Preserve compatibility with existing reactive primitives.

### Phase 3 - Remove Runtime Parse/Rebuild
- [ ] Remove runtime HTML parsing for fast path.
- [ ] Remove recursive `h(...)` reconstruction from fast path.
- [ ] Resolve dynamic targets by precomputed descriptor paths only.

### Phase 4 - Benchmark Hardening
- [ ] Ensure inspector `uic` benchmark uses transformed/hoisted output shape.
- [ ] Persist snapshots to `tests/data/benchmark-inspector-*.json`.
- [ ] Print `uic` vs `ui` delta (% and absolute).

### Phase 5 - Acceptance
- [ ] Snapshot parity for `ui` and `uic`.
- [ ] `uic` patch script time improves by 10-25% vs `ui` on `--runs >= 5`.
