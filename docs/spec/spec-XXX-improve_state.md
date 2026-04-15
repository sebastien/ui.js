# UI.js Specification: Improve State Management

## Overview

As `ui-faster` evolves to support complex, real-world applications, its state management capabilities must provide robust primitives that handle complex reactive graphs efficiently. While `Slot`, `Observable`, and `Cell` provide a solid reactive foundation, several gaps prevent seamless scalability.

This specification outlines the required improvements to state propagation, computation, and synchronization.

## 1. Derived / Computed State Caching

### Problem
While `ui-faster` has `DynamicEvaluation` and `Derivation`, real-world applications rely heavily on cached computed values (e.g., filtered lists, expensive calculations). Currently, there is no standardized API for computed state that automatically tracks dependencies and caches the result until a dependency updates.

### Proposed Solution
Introduce a `Computed` or `Derived` cell primitive:
- Automatically tracks `Slot`/`Observable` reads during execution.
- Caches its return value.
- Re-evaluates *only* when tracked dependencies emit a change.
- Subscribing to a computed cell subscribes the component to the computed output, preventing unnecessary re-renders.

## 2. Global State Injection (Context/Store)

### Problem
Contexts are currently tightly coupled to the component tree via `Slot.Owner` and `Slot.Parent`. Passing state through deeply nested component hierarchies (prop drilling) becomes tedious and fragile.

### Proposed Solution
Implement a "Provide/Inject" or Environment API:
- Allow registering a global or scoped "Store" at a root context.
- Child components can access this store by requesting it from their environment without explicit prop passing.
- Actions (patch, sub, get) inside handlers interact directly with this injected environment.

## 3. Update Batching

### Problem
Multiple synchronous state mutations (e.g., receiving a complex WebSocket payload) trigger independent update cycles, leading to redundant DOM reflows and performance degradation.

### Proposed Solution
Implement an event loop or microtask batching system:
- When a `Slot` is modified, its resulting DOM updates are deferred to the next microtask (e.g., via `queueMicrotask` or `requestAnimationFrame`).
- If multiple slots mutate within the same execution frame, all dependent DOM nodes are updated exactly once at the end of the batch cycle.

## 4. Two-Way Data Binding for Forms (Input Synchronization)

### Problem
Manually wiring `onInput` and `value` attributes for every form field is highly repetitive and prone to edge-case bugs (e.g., cursor jumping during rapid typing).

### Proposed Solution
Introduce a formalized two-way binding directive or standard hook (e.g., `bind:value={mySlot}`):
- Synchronizes an input element's value with a `Slot`/`Cell` automatically.
- Handles native DOM events appropriately (e.g., input, change, focus, blur).
- Protects against cursor reset issues in text inputs by preventing self-feedback loops.

## 5. Lifecycle and Effect Watchers

### Problem
While components support `onMount` and `onUnmount`, there is no formalized primitive to declare an isolated side-effect that reacts to specific `Slot` changes (e.g., React's `useEffect(fn, [deps])` or Vue's `watch`). Managing manual `.sub()` and `.unsub()` subscriptions inside component lifecycles is error-prone and leads to memory leaks.

### Status
Implemented via `$.effect(...)` / `$.watch(...)` watcher semantics.

See `spec-006-effect_watchers.md` for:
- multi-dependency watcher API,
- lifecycle-scoped cleanup,
- async latest-wins (`switch`) behavior,
- explicit context-safe async update guidance.
