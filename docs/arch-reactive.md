# Reactive Architecture in ui.js

This document details the reactive architecture of `ui.js`, focusing on how state is managed, how it flows between components, and how updates propagate both top-down (state to DOM) and bottom-up (DOM to state). 

Unlike virtual DOM libraries that rely on tree reconciliation, or closure-based reactive libraries, `ui.js` relies on a centralized, index-based **Context** system.

## 1. Core Primitives

The reactivity model is built on four fundamental pillars: `Slot`, `Context`, `Cell`, and `Signal`.

### Slot (The Identity)
A `Slot` is essentially a reactive key. It holds no state itself; rather, it acts as a pointer to a location within a `Context`. 
Every `Slot` is assigned an integer ID with a stride of 6. This stride reserves 6 consecutive indices in the context array for different facets of the slot's lifecycle:
- `+0`: The current **value**
- `+1`: The **observable** (an array of subscriber functions)
- `+2`: The **revision** counter
- `+3`: The associated DOM **node**
- `+4`: Internal **state** (e.g., matching results or effect states)
- `+5`: The **render** closure for effects

### Context (The State Tree)
The `Context` is where the actual state lives. It is typically a flat Array (or an Object inheriting from a parent Context via prototypes).
- **No Closures:** State is not trapped in closures. Instead, all reactive values and their subscribers for a given component instance live in a specific `Context` array.
- **Context Stack:** `Context.Stack` acts as a global singleton that tracks the currently active context during rendering or event handling.
- **Hierarchy:** When a component renders, it spawns a child context that points to the parent context (via `[Slot.Parent] = context`).

### Cell (Local Reactive State)
A `Cell` wraps a static value or another slot, making it reactive within the *current* component context.
- When a `Cell` is evaluated (`applyContext`), it binds its state and subscribers to the active component's `Context`.
- If a component is destroyed, the cell's state in that context is garbage collected.
- It is ideal for local, ephemeral component state.

### Signal (Independent/Global State)
A `Signal` extends `Cell` but maintains its *own* canonical context (`this.context = []`).
- It overrides `applyContext` to always evaluate against its own context rather than the active component's context.
- This detaches its reactivity from the component tree, making it persistent. 
- It is ideal for shared, global, or cross-component state. Even if the component that created it unmounts, the `Signal` retains its state.

---

## 2. Value Flow Across Components

When a parent component passes properties to a child component (e.g., `<Child foo={value} />`), `ui.js` handles the flow differently based on the type of the value:

### Regular Values
Plain JavaScript values (strings, numbers, objects) are inert. When passed to a component, they are matched into the child's context via `Slot.Match` and remain static. They are rendered once and do not trigger re-renders unless the parent explicitly passes a new value and forces a re-render.

### Cells (Derived/Local State)
When a `Cell` is passed down, it is injected into the child component. The injection system creates a bridge between the parent's context and the child's context. If the cell updates in the parent, the child receives the new value.

### Signals (Shared State)
Signals are passed by reference. Because they have their own canonical context, the child component simply subscribes to the Signal's context. Updates to the Signal instantly notify all subscribing components, regardless of where they are in the DOM tree.

### Callbacks (Event Handlers)
Callbacks (like `onClick`) need to execute in the context of the component that defined them, not the component that triggered them. 
When hyperscript or JSX creates an event handler, it uses `select.bind()`, which attaches a `BOUND_CONTEXT` symbol to the function. When the callback is invoked, `Context.Run(boundContext, ...)` is used to temporarily restore the original component's context onto the `Context.Stack`.

### Components (`TemplateEffect`)
Components act as context boundaries. A `TemplateEffect` takes the inputs, evaluates them, creates a new derived context (inheriting from the parent), and then mounts its child effects (DOM nodes, text, etc.) into that new context.

---

## 3. Top-Down Update Propagation (State to DOM)

Top-down propagation occurs when a reactive value changes, causing the UI to update.

1. **Mutation Phase:** A developer calls `cell.set(newValue)` or `signal.update(...)`. This resolves to a `Slot.Notify(context, id, value)` call.
2. **Context Resolution:** 
   - For a `Cell`, the update hits the local component context.
   - For a `Signal`, the update hits its canonical context and propagates outward.
3. **Dirty Marking & Topological Sort:** `ui.js` supports derived computations (e.g., `Slot.Derive`). When a source slot changes, it marks all dependent slots as dirty (`Slot.MarkDependentsDirty`). These are queued in `Slot.Pending` and re-evaluated sequentially by rank to avoid glitching (rendering intermediate/stale states).
4. **Granular Rendering:** `Slot.Notify` iterates over the subscribers in `context[id + Slot.Observable]`. 
   - In `ui.js`, these subscribers are typically fine-grained closures registered by UI effects (e.g., `AttributeEffect`, `TextEffect`).
   - Instead of re-rendering the whole component or diffing a Virtual DOM, the subscriber directly invokes `this.render()` on the specific effect, immediately patching only the exact DOM node or attribute that changed.

---

## 4. Bottom-Up Update Propagation (DOM to State)

Bottom-up propagation occurs when a user interacts with the DOM, updating state which may then need to reflect back up the component tree.

1. **Event Capture:** A DOM event (e.g., `input`, `click`) fires.
2. **Context Restoration:** The event listener, previously wrapped by `select.bind()`, executes. It pushes its `BOUND_CONTEXT` onto the `Context.Stack`, ensuring that any state mutations happen in the correct component scope.
3. **State Mutation:** The handler calls `cell.set(newValue)` on a local variable or an injected property.
4. **Bidirectional Aliasing:** If the child component mutates a property that was passed down from a parent, `ui.js` uses `INJECTION_ALIASES` and `INJECTION_SOURCES`. 
   - During component setup (in `templates.js`), an alias map is built linking the child's slot ID to the parent's source Context and ID.
   - When `Slot.Notify` sees a mutation on an aliased slot, it traverses the `INJECTION_ALIASES` up to the `sourceContext`.
   - It mutates the source context directly, effectively pushing the data *up* the tree.
5. **Ripple Effect:** Once the parent's context (or the canonical Signal context) is updated, normal Top-Down propagation takes over. Any other sibling components or effects observing that parent state are immediately notified and re-rendered.

---

## 5. Critique: Use Case Perspective

### Supported Scenarios
- **Granular Reactivity:** Updating a specific state bound to a specific DOM attribute completely bypasses Virtual DOM diffing. It patches only what changed.
- **Global and Local State Symbiosis:** `Cell` and `Signal` provide a clear API boundary between ephemeral component state and permanent global state.
- **Two-Way Data Binding:** `INJECTION_ALIASES` enable native two-way binding. A child component can modify an injected property and transparently update the parent's state, simplifying form and input management.

### Unsupported or Difficult Scenarios
- **Time-Travel Debugging:** Because `Context` relies on arrays/objects being mutated in place (`context[id] = newValue`), previous states are completely overwritten. Implementing a Redux-like time-travel debugger is fundamentally incompatible with this mutable, distributed array approach.
- **Strict Unidirectional Flow:** The built-in bottom-up mutation via `INJECTION_ALIASES` breaks strict unidirectional data flow. If not carefully managed, this can lead to "spaghetti" state updates where it's hard to track which child triggered a parent update.
- **Deeply Nested Derived State Traceability:** Because of the transparent prototype-chain inheritance (`Object.create(context)`) and alias maps, debugging *why* a particular derived cell updated (or didn't) across deep component trees can be highly opaque.

### Design Issues & Potential Improvements
- **Alias Map Complexity:** Maintaining `INJECTION_ALIASES` and `INJECTION_SOURCES` is memory-intensive and creates complex lifecycle dependencies. An improvement would be standardizing on read-only downward props with explicit callback functions for upward mutations (React-style), which simplifies the mental model and reduces framework overhead.

## 6. Critique: Performance Evaluation

### Strengths
- **Index-Based Access:** By representing `Slot`s as integer IDs mapping to array indices (`context[id + offset]`), the framework leverages V8's monomorphic array property access, which is drastically faster than object property lookups or closure captures.
- **No Virtual DOM Diffing:** By connecting observables directly to granular DOM effects, `ui.js` achieves O(1) update times relative to the DOM, unlike React's O(N) tree-diffing cost.

### Gaps & Risks
- **Sparse Array Deoptimization (Critical):** `Slot.Id` is a global counter. If a large application instantiates 10,000 slots globally, the 10,000th slot will have an ID of roughly 60,000 (stride of 6). When a new component mounts and creates a local `Context` array (`[]`), allocating `context[60000] = value` instantly creates a **sparse array**. V8 engine handles sparse arrays by silently deoptimizing them into dictionary mode (hash maps). This entirely defeats the primary performance premise of "fast array index access" and leads to massive memory overhead.
- **Prototype Chain Lookups:** `ui.js` relies on prototype inheritance (`Object.create(context)`) for child context resolution. While creation is fast, reading `context[id]` when the property exists 5 levels up the prototype chain is significantly slower than a direct property read.
- **Garbage Collection Leaks:** Arrays holding functions (in `Slot.Observable`) and DOM nodes (`Slot.Node`) are highly susceptible to memory leaks. If a component unmounts but its context array isn't meticulously cleared (`Context.Clear`), detached DOM nodes and closures will be kept alive indefinitely.

## 7. Alternative Approaches

If the current `Context` array + `Slot` ID approach proves to be too vulnerable to sparse array deoptimization or prototype-chain overhead, several alternatives exist:

### Approach A: Closure-Based Reactivity (SolidJS / Preact Signals)
Instead of centralizing state in a `Context` array, each reactive primitive (Signal/Memo) is a standalone closure that tracks its own subscribers.
- **Pros:** Completely eliminates the sparse array and prototype chain issues. Memory is reliably garbage collected when the closure becomes unreachable.
- **Cons:** Higher initial allocation cost (more closure objects created per component).

### Approach B: Map-Based Context
Replace the flat arrays with standard `Map` instances (`new Map()`), where the key is the `Slot` object or a `Symbol`, and the value is a state record.
- **Pros:** Solves the sparse array problem immediately. Prevents key collisions naturally.
- **Cons:** Slightly slower than packed array access, though still highly optimized in modern engines.

### Approach C: Structure of Arrays (ECS Pattern)
Instead of scattering instances of contexts, maintain global typed arrays (e.g., `Float64Array` for numbers, arrays for objects) where the index is the `Slot` ID.
- **Pros:** Extremely cache-friendly; maximizes data locality.
- **Cons:** Overly complex for UI development. Managing lifetimes, garbage collection, and dynamic component mounting in a rigid SoA structure is exceptionally difficult in JavaScript.
