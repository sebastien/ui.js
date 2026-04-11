# UI.js Component Model

This document explains how components work in the `src/js/ui` runtime, with a focus on state ownership, parent/child data flow, handlers, and slot/cell semantics.

## Example 1: Simple stateless component

Start with a plain component that only consumes inputs:

```js
import { h } from "@ui/hyperscript.js";

const Greeting = ({ name }) => h.p("Hello ", name.text(), "!");

const App = () => h.div(h(Greeting, { name: "UI.js" }));
```

What this shows:

- Component arguments (`{ name }`) are slot-like inputs, not plain snapshots.
- Using `name.text()` creates a formatting effect bound to that input.
- No local state is retained here.

## Example 2: Stateful parent controlling child components

This pattern combines retained state, data flow to children, and handler passing (`setValue`):

```javascript
import { h, $ } from "@ui/hyperscript.js";

const TextInput = ({ label, value, setValue }) =>
  h.label(
    label,
    h.input({
      value,
      onInput: (event) => setValue(event.target.value),
    })
  );

export const App = () => {
  const form = $.cell({ first: "", last: "" });
  let context;
  let stateForm = { first: "", last: "" };

  const setField = (field, value) => {
    stateForm = { ...stateForm, [field]: value };
    form.set(stateForm, true, context);
  };

  return h.section(
    h(TextInput, {
      label: "First name",
      value: form.apply((v) => v.first),
      setValue: (next) => setField("first", next),
    }),
    h(TextInput, {
      label: "Last name",
      value: form.apply((v) => v.last),
      setValue: (next) => setField("last", next),
    }),
    h.p(form.apply((v) => `${v.first} ${v.last}`))
  );
};
```

What this shows:

- State is retained in closure (`stateForm`) and synchronized into a reactive cell (`form`).
- Parent passes reactive data to children (`value: form.apply(...)`).
- Parent passes handler props to children (`setValue`) and child uses them in DOM events.
- Only effects depending on changed slots rerun.

## Mental model

In UI.js, a component function is treated as a template factory:

- `component(MyComponent)` inspects arguments, creates `Argument` slots, and builds `component.template` once.
- Rendering updates effects bound to slots and contexts.
- Updates are granular (effect-level), not full component reruns.

If you are coming from React, this is the first major difference: component functions are not repeatedly called as a render loop for each state change.

## Where state can be stored

You usually combine two kinds of state:

1. Reactive state in slots/cells (drives DOM updates)
2. Plain JS closure state (for orchestration or cheap derived bookkeeping)

### Reactive state: `$.cell(...)`

`$.cell(initial)` creates a `Cell` (a writable selection/slot abstraction). To make it live, bind it to a context:

```js
const count = $.cell(0);
const context = {};

count.observable(context);
count.set(0, true, context);
```

Then use it in templates with effects such as `count.text()`, `count.apply((v) => ...)`, `count.map((item) => ...)`, or `count.match(...)`.

### Plain JS state in closures

You can also store state in closure variables:

```js
let draft = "";
const text = $.cell("");
```

This is common in this codebase: closure state is mutated first, then synced into a cell with `cell.set(...)`.

Important: closure state alone is not reactive. DOM updates happen only when slot/cell values notify subscribers.

## Passing data to subcomponents

Use hyperscript component application:

```js
h(Child, { value, label: "Name" })
```

`value` may be a plain value, a slot/cell, a function, or children/effects.

At runtime, UI.js injects parent inputs into a child derived context. If a prop is a slot, the child reads the same reactive source (subscriber arrays are shared), so updates propagate without manual wiring.

### Children

Children are passed as `children` in input shape. In hyperscript/JSX this is automatic:

```js
h(Panel, { title: "Info" }, h.span("content"))
```

Equivalent idea in JSX:

```jsx
<Panel title="Info"><span>content</span></Panel>
```

In UI.js, this is still slot/input injection mechanics, not a separate reconciliation model.

## Lifecycle Events

UI.js provides specific DOM-based lifecycle events that you can attach to any element. Unlike React's `useEffect`, these are bound to actual DOM node mounting and unmounting, rather than component render cycles.

The events are mapped via hyperscript attributes:
- `onmount(node)`: Called exactly once when the element is attached to the DOM.
- `onunmount(node)`: Called exactly once when the element is removed from the DOM.

```js
const Chart = ({ data }) => {
  return h.div({
    class: "chart-container",
    onmount: (node) => {
      // Good place to initialize third-party libraries (e.g., D3, Chart.js)
      // or set up manual DOM listeners.
      console.log("Chart container mounted", node);
    },
    onunmount: (node) => {
      // Good place to clean up timers, external event listeners,
      // or destroy third-party library instances.
      console.log("Chart container unmounted", node);
    }
  });
};
```

These hooks are powerful because they receive the actual DOM node instance, making imperative integration trivial without needing external "ref" primitives.

## Component Communication (Lists & Mutations)

In UI.js, component communication strictly favors the **"Data down, Actions up"** pattern (passing data to read, and callbacks/handlers to mutate). 

While it might be tempting to pass a cell down and call `items.append(...)` directly inside the child, UI.js specifically isolates state to prevent unintended bidirectional side effects. When you pass a cell to a child component, UI.js securely maps the parent's cell into a new, isolated `Argument` slot inside the child's derived context. If the child mutates the cell reference, it only overrides the value in the **child's local context**. The parent's context remains unaware of the new list reference.

Therefore, to mutate a list from a child component, you should pass **handlers** (like `onAdd`, `onRemove`, or `setItems`) from the parent context.

Here is exactly how you handle a list of items where the child can add/remove them:

```javascript
import { h, $ } from "@ui/hyperscript.js";

// 1. The Child component receives the data to read, and the actions to write
const ListManager = ({ items, onAdd, onRemove }) => {
  return h.div(
    h.button({ 
      // Call the parent's handler to add a new item
      onClick: () => onAdd({ id: Date.now(), name: "New Item" }) 
    }, "Add Item"),
    
    h.ul(
      // Iterate over the items reactively
      items.map(item => h.li(
        item.apply(v => v.name),
        " ",
        h.button({ 
          // Call the parent's handler to remove this specific item
          onClick: () => onRemove(item.get().id) 
        }, "Remove")
      ))
    )
  );
};

// 2. The Parent component owns the state and the mutation logic
export const App = () => {
  const items = $.cell([]);
  let context;
  
  // Maintain a standard JS closure for the "source of truth"
  let stateItems = [
    { id: 1, name: "First Item" }
  ];

  const addItem = (newItem) => {
    stateItems = [...stateItems, newItem];
    items.set(stateItems, true, context);
  };

  const removeItem = (id) => {
    stateItems = stateItems.filter(item => item.id !== id);
    items.set(stateItems, true, context);
  };

  return h.section(
    h.h3("My Items"),
    // Pass the reactive cell and the mutation handlers
    h(ListManager, { 
      items: items, 
      onAdd: addItem, 
      onRemove: removeItem 
    })
  );
};
```

### Why this is the preferred way:
1. **Centralized State:** The parent component acts as the "source of truth". It retains the closure (`stateItems`) and explicitly synchronizes it with the reactive `items` cell.
2. **Context Safety:** Handlers created in the parent (`addItem`, `removeItem`) naturally close over the parent's `context` and state variables. When UI.js executes them from the child's DOM events, it automatically wraps them to ensure they execute safely against the parent's state.
3. **Predictability:** It makes data flow explicit and prevents nested components from secretly mutating complex shared data structures.

## Passing handlers to subcomponents

Pass handler functions as normal props and call them from DOM handlers in the child.

Notes:

- DOM event props (`onInput`, `onClick`, etc.) become `EventHandlerEffect`s.
- Passing a function prop to a child keeps it callable in child context.
- When functions are injected as regular values, UI.js wraps them through `Context.Run(...)` so they execute with the right current context.

This differs from React mostly in execution model, not in surface syntax: callbacks are still passed down, but updates are slot notifications instead of component rerenders.

## Slots and cells: how they work

`Slot` is the core primitive:

- each slot has a unique numeric `id`
- value is stored in a render context at `context[slot.id]`
- subscribers live at `context[slot.id + Slot.Observable]`
- writes go through `Slot.Notify(...)` / `slot.set(...)`

`Cell` extends this with source/updater behavior and is the practical writable primitive you usually use via `$.cell(...)`.

### Derived contexts

When UI.js applies a component, map item, or conditional branch, it often creates a derived context (`Object.create(parentContext)` or injected child context).

That gives:

- per-instance state isolation
- parent value visibility
- selective reactive sharing for injected slots

### Mapping (`slot.map`)

`map` creates per-item contexts and updates only changed items.

- `items.map((item) => h(Row, { item }))`
  - if item is object-like with an `id` property, UI.js uses `id` as the default key.
  - otherwise UI.js falls back to index-based mapping.
- `items.map((item, index) => h(Row, { item, index }), (value, i) => value.id)`
  - explicit `keyBy` always wins and is recommended for stable identity.

Using stable keys preserves component-local state (for example edit mode, draft input, focus) when removing/reordering list items.

## Key differences vs React

1. Component function lifecycle
   - React: function component executes on each render.
   - UI.js: component function is compiled into template/effects; updates run through slot/effect graph.

2. Update granularity
   - React: rerender subtree then reconcile.
   - UI.js: rerun only subscribed effects for changed slots.

3. State primitives
   - React: `useState` tied to rerender.
   - UI.js: slots/cells are context-backed reactive values with explicit notify/subscription behavior.

4. Context model
   - React: provider/consumer and render-phase semantics.
   - UI.js: runtime context stack (`Context.Push/Pop/Run`) and derived context objects.

5. Children/props flow
   - Similar surface API (`props`, callbacks, children), but underneath UI.js uses slot matching/injection rather than rerendering component calls.

## Practical guidance

- Store UI-facing reactive data in cells.
- Keep ephemeral orchestration values in closures, then sync to cells.
- Pass slots to children when you want reactive sharing.
- Pass functions (`setValue`, `onSave`) directly; use them in DOM handlers.
- Think in terms of effect subscriptions, not component rerender cycles.
