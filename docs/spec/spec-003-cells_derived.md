# Derived cells

We want to add support derived cells in `cells.js` and in the `$` api.

```javascript
const EditableLabel = ({isEdited,default,placeholder,value})=>{
  // NOTE: Here the second argument being a function means: we derive the first argument
  const label = $.cell({default,placeholder,value}, ({default,placeholder,value})=>value ?? default ?? placeholder)
  return isEdited.match(_=>
    _.case(true, <input type="text" value={label} onChange={event=>value.set(event.target.value)} />)
     .else(<span>{label}</span>)
   )
}
```

The high-level API is through `$.cell(shape,processor,lazy=false)` where shape is either
`{[key]:Cell} ` or `Cell[]`.

Now, the process of managing derived cells needs to be carefully thought out:

- Derived cells create a cell network, where each cell has a rank within the
  scope of the component. This can be known at component creation time as all
  cells are registered (and certainly, cell creation should be tracked when
  declaring a component)

- Derived cells are eager by default, their value is calculated on first render
  and updated whenever an input change. When specified as lazy, they are only
  updated on demand through a "get"

- When input changes, a new cycle is created. All inputs/updates are scheduled
  in rank order, so that we minimise the number of cycles, and give a chance
  for all predecessors to execute. This means that the cycle is most likely
  a deferred process.

- As a result, cycles are forbidden in a cell network, and need to fail
  explicitely at declaration time.

- Cells must all support promises, and derived cells by default wait on all
  promises to fulfill before proceeding. If an input promise changes (old
  promise cancelled or replace), then the intermediate result is not produced.

## Implementation Architecture

### 1. Extending the Context and Slot Layout
To maintain the zero-allocation, high-performance nature of `cells.js` for standard cells, we will minimize memory overhead by not expanding the default `Slot` stride (currently 6). Instead, derived cells will store a reference to a `DerivationContext` object in one of the existing slots (e.g., `State` or `Render` if unused by pure cells, or a dedicated extension point).
The `DerivationContext` will hold:
- `processor`: The derivation function.
- `dependencies`: Array of input `Slot` instances.
- `rank`: The topological depth of the cell (max rank of inputs + 1).
- `lazy`: Boolean flag indicating if the cell is evaluated on-demand.
- `cycle`: An integer tracking the current evaluation cycle (to handle Promise race conditions and discard stale futures).

**Rank Calculation & Cycle Detection:** When a derived cell is instantiated via `$.cell(shape, processor, lazy)`, we resolve its inputs. If any input traces back to the cell itself, an error is thrown immediately. The new cell's rank is calculated on the spot.

### 2. The Deferred Update Cycle (Global Scheduler)
Instead of `Slot.Notify` instantly pushing updates to all subscribers (which would cause glitches/multiple evaluations for derived cells), we introduce a global **Scheduler** using microtasks.
- When a base cell's value changes, we mark it as "dirty" and queue a microtask (e.g., via `queueMicrotask`).
- The global queue collects all dirtied cells across contexts within the current synchronous execution window.
- When the microtask runs, we determine the "strand" (all transitive descendants of the dirtied cells).
- The strand is sorted by **rank** in ascending order.
- We evaluate the processor of each derived cell in the strand exactly once.

### 3. Eager vs. Lazy Evaluation
- **Eager (Default):** The derived cell's value is computed immediately during `$.cell()` setup. Whenever an input changes, the deferred scheduler re-evaluates it and notifies its own subscribers.
- **Lazy (`lazy=true`):** The cell acts as a pull-based thunk. It does not re-evaluate during the deferred cycle. Instead, it only marks itself as "stale" when an input changes. When `cell.value` or `cell.get()` is called, it checks its stale flag and re-evaluates synchronously if needed.

### 4. Asynchronous Evaluation (Promises & Futures)
Handling Promises requires tracking the sequence of updates to prevent race conditions (where an older slower promise resolves after a newer faster promise).
- **Cycles:** Each time the deferred queue runs, a global (or context-local) `cycle` counter is incremented.
- When a derived cell executes its processor and returns a `Promise`, the cell records the `cycle` ID of that evaluation.
- **Promise Resolution:** When the Promise resolves, the cell checks if the resolving `cycle` matches its *current* recorded `cycle`. If a newer cycle has started (because inputs changed again in the meantime), the intermediate result is discarded.
- **Dependency Promises:** If inputs to a derived cell are Promises, the derived cell's evaluation is suspended until `Promise.all(inputs)` resolves, propagating the cycle ID check natively.

### 5. `$.cell` API Normalization
The `shape` argument allows maps (`{a, b}`) or arrays (`[a, b]`). `Slot.Match` or a similar normalizer will extract the underlying `Slot` instances to build the dependency array for ranking and subscription, passing the resolved values to the `processor` in the matching shape.

### 5.1 API Examples

```javascript
// Regular state cell (existing behavior)
const count = $.cell(0)

// Derived cell with object shape (named arguments)
const label = $.cell(
  { count },
  ({ count }) => `Count: ${count}`
)

// Derived cell with array shape (positional arguments)
const sum = $.cell(
  [left, right],
  ([left, right]) => left + right
)

// Lazy derived cell
const expensive = $.cell(
  { data, filter },
  ({ data, filter }) => computeExpensive(data, filter),
  true
)

// NOTE: Dependencies are static.
// Only `data` triggers re-evaluation here; reading `theme.get()` does not.
const preview = $.cell(
  { data },
  ({ data }) => renderPreview(data, theme.get())
)
```

Shape constraints for derived mode:
- `shape` must be a plain object or array.
- Every leaf in `shape` must be a `Slot`.
- Non-slot values in `shape` are invalid in derived mode.
- If `updater` is a function and shape is valid, `$.cell(...)` creates a derived cell.
- Otherwise `$.cell(...)` keeps existing regular-cell behavior.

### 6. Architectural Edge Cases & High-Performance Guards

To ensure the system remains high-performance (zero-allocation overhead where possible) and robust, we must carefully guard against the following inherent pitfalls of deferred DAG execution:

#### Context Binding in a Deferred Scheduler
- **Pitfall:** `Context.Stack` tracks the active context synchronously. Deferring execution to a global microtask means `Context.Get()` will be empty or wrong when the derivation actually runs.
- **Guard:** The global scheduler's queue must store explicit tuples of `(context, slot_id)` rather than just global cell IDs. When the scheduler executes a derived cell, it wraps it in `Context.Run(context, processor, args)` so that any nested context access resolves correctly.

#### Strictly Static Dependencies
- **Pitfall:** Dynamically tracking dependencies (like MobX or Vue) requires intercepting all `.get()` calls during execution, adding massive overhead and proxy complexity.
- **Guard:** Dependencies are strictly static, explicitly defined by the `shape` parameter. Reading an untracked cell inside the processor will *not* subscribe the derived cell to it. This aligns perfectly with `Slot.Match` and allows dependency arrays to be pre-allocated and fast to iterate.

#### The Diamond Problem & Strand Calculation
- **Pitfall:** If Cell A feeds into Cell B and Cell C, and both B and C feed into Cell D. When A changes, D might accidentally evaluate twice (once when B updates, once when C updates), causing glitches and wasted cycles.
- **Guard:** To solve this efficiently, `DerivationContext` will track both `dependencies` (inputs) AND `successors` (outputs). When A changes, the scheduler does a fast topological traversal of `successors` to build the "strand" (B, C, D). It then sorts the strand strictly by **rank** and processes each exactly once.

#### Synchronous Flush (Stale Reads)
- **Pitfall:** Because updates are deferred, if `base.set(2)` is called, a subsequent immediate `derived.get()` in the same synchronous block will return the stale old value.
- **Guard:** When a cell is dirtied, a `dirty` flag is set in its context. If `.get()` or `.value` is accessed on a derived cell while it (or its inputs) are marked `dirty`, it triggers a **synchronous flush**. The cell forces its own re-evaluation (and any dirty predecessors) immediately, bypassing the microtask queue, ensuring consistent reads.

#### Component Unmounting & Memory Leaks
- **Pitfall:** A base cell triggers an update, queueing a microtask. Before the microtask runs, the component is unmounted. Executing the derivation wastes CPU and might throw errors (e.g., operating on destroyed DOM nodes).
- **Guard:** The scheduler checks if the `context` is still "alive" (e.g., checking if it has been cleared via `Context.Clear` or if its associated DOM node is still valid) before executing the strand.

### 7. Required Test Suite

To guarantee the stability of this architecture, the implementation MUST include tests exercising the following scenarios:

1. **The Diamond DAG:** 
   - *Setup:* A -> B, A -> C, (B, C) -> D. 
   - *Action:* Update A. 
   - *Assertion:* D's processor is called exactly *once*. D's value reflects the updated A.
2. **Synchronous Stale Read Prevention:**
   - *Setup:* A -> B. 
   - *Action:* Call `A.set(newValue)`, then immediately `B.get()`. 
   - *Assertion:* `B.get()` returns the derived `newValue`, not the old value. The subsequent microtask does not re-evaluate B redundantly.
3. **Cycle Detection:**
   - *Setup:* Attempt to declare A -> B -> C -> A.
   - *Assertion:* Throws a clear cyclic dependency error at declaration time, before any evaluation occurs.
4. **Promise Race Conditions:**
   - *Setup:* A -> B (where B returns a Promise based on A). 
   - *Action:* Set A to `1` (takes 100ms to resolve). Immediately set A to `2` (takes 10ms to resolve).
   - *Assertion:* B's final value is the result of `2`. The delayed resolution of `1` is discarded due to cycle ID mismatch.
5. **Context Preservation:**
   - *Setup:* A -> B, where B's processor relies on `Context.Get()`.
   - *Action:* Update A. Wait for microtask.
   - *Assertion:* Inside B's processor, `Context.Get()` correctly returns the specific instance context, not undefined.
6. **Lazy Evaluation:**
   - *Setup:* A -> B (lazy). 
   - *Action:* Update A. Wait for microtask.
   - *Assertion:* B's processor is *not* called. 
   - *Action:* Call `B.get()`. 
   - *Assertion:* B's processor is called exactly once to fulfill the read.
7. **Unmount Abort:**
   - *Setup:* A -> B. 
   - *Action:* Update A. Destroy/Clear the context. Wait for microtask.
   - *Assertion:* B's processor is never executed.
