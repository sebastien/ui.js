# UI.js Effects Reference

Effects are the bridge between reactive `Slot`s (or `Cell`s) and the DOM. In UI.js, components do not re-render entirely when state changes. Instead, changes to a cell trigger only the specific effects subscribed to it, resulting in highly granular, efficient DOM updates without virtual DOM diffing of the whole tree.

This reference covers the primary effects available in UI.js and how they are implicitly or explicitly used via the hyperscript API (`h`).

---

## 1. Content & Formatting Effect (`FormattingEffect`)

**Purpose:** Updates the text content of a DOM node reactively.

**How to use:** Triggered implicitly when passing a reactive cell as a child to a hyperscript element, or explicitly by calling `.text(formatter)` on a cell to apply a transformation before rendering.

**Examples:**

```javascript
import { h, $ } from "@ui/hyperscript.js";

const count = $.cell(0);

// Implicit text content
h.div("Current count: ", count)

// Explicit formatting
h.div(count.text(v => `Formatted count is ${v.toFixed(2)}`))
```

---

## 2. Attribute Effect (`AttributeEffect`)

**Purpose:** Binds a reactive cell to a DOM element's attribute or property. When the cell value changes, the attribute is updated.

**How to use:** Triggered automatically when you pass a cell as the value of an attribute in hyperscript.

**Example:**

```javascript
const isChecked = $.cell(false);
const isDisabled = $.cell(true);

h.input({
    type: "checkbox",
    checked: isChecked, // Reactively toggles the checked property
    disabled: isDisabled // Reactively toggles the disabled attribute
})
```

---

## 3. Ref Effect (`RefEffect`)

**Purpose:** Exposes the mounted DOM element for imperative use and guarantees cleanup on unmount.

**How to use:** Triggered by the `ref` attribute in hyperscript or JSX. A ref can be either a `Cell`/`Slot` or a callback.

**Examples:**

```javascript
import { h, $ } from "@ui/hyperscript.js";

const inputRef = $.cell(null);

// Cell/Slot ref: node is assigned on mount, reset to null on unmount
const WithCellRef = () =>
    h.input({
        type: "text",
        ref: inputRef,
        onMount: () => inputRef.get()?.focus()
    });

// Callback ref: called with node on mount and null on unmount
const WithCallbackRef = () =>
    h.canvas({
        ref: (node) => {
            if (node) {
                // initialize imperative integration
            } else {
                // cleanup
            }
        }
    });
```

---

## 4. Event Handler Effect (`EventHandlerEffect` & `LifecycleEventHandlerEffect`)

**Purpose:** Attaches DOM event listeners and manages component lifecycle hooks. UI.js automatically wraps handlers to ensure they execute within the correct reactive context (`Context.Run`).

**How to use:** Triggered by attributes starting with `on` (e.g., `onClick`, `onInput`, `onmount`, `onunmount`).

**Examples:**

```javascript
// Standard DOM event
h.button({
    onClick: (e) => console.log("Clicked! Event:", e)
}, "Click me")

// Lifecycle events
h.div({
    // Triggered when the element is attached to the DOM
    onmount: (node) => console.log("Mounted element:", node),

    // Triggered when the element is removed from the DOM
    onunmount: (node) => console.log("Unmounted element:", node)
}, "Hello Lifecycle")
```

---

## 5. Mapping Effect (`MappingEffect`)

**Purpose:** Efficiently renders and reconciles lists or arrays of data. `MappingEffect` creates a derived context for each item in the array. When the array changes, it reuses DOM nodes and local state for items that haven't changed, making it highly performant for data grids or long lists.

**How to use:** Triggered by calling `.map(factory)` on a cell containing an array or an iterable.

**Example:**

```javascript
const items = $.cell([
    { id: 1, text: "Learn UI.js" },
    { id: 2, text: "Build an app" }
]);

h.ul(
    // The factory receives a reactive `item` slot, not a static value
    items.map((item) => h.li(
        item.apply(v => v.text) // Extract the text property reactively
    ))
)
```

---

## 6. Conditional Effect (`ConditionalEffect`)

**Purpose:** Handles branching logic (if/else/switch), rendering only the active branch and automatically unmounting the others.

**How to use:** Triggered by calling `.match()` on a cell and chaining `.case()` and `.else()` conditions.

**Example:**

```javascript
const status = $.cell("loading");

h.div(
    status.match(_ => _
        .case("loading", h.span("Loading data..."))
        .case("error", h.span({ class: "error" }, "An error occurred!"))
        .else(h.span("Data loaded successfully!")) // Default branch
    )
)
```

---

## 7. Component & Template Effects (`ComponentEffect` / `TemplateEffect`)

**Purpose:** Mounts and manages sub-components. This effect handles inspecting the child component's arguments, creating `Argument` slots, building the template once, and injecting the parent's reactive data into the child's derived context.

**How to use:** Triggered automatically by passing a component function as the first argument to `h()`.

**Example:**

```javascript
const Greeting = ({ name }) => h.span("Hello ", name.text());

const App = () => {
    const userName = $.cell("World");
    return h.div(
        // Renders Greeting as a sub-component, passing userName reactively
        h(Greeting, { name: userName })
    );
}
```

---

## 8. Dynamic Component Effect (`DynamicComponentEffect`)

**Purpose:** Allows dynamically swapping the component type being rendered based on a reactive value (similar to dynamic `<component is="...">` in other frameworks). When the cell value changes, the old component is unmounted and the new one is mounted in its place.

**How to use:** Triggered by passing a reactive cell (instead of a string tag or static function) as the first argument to `h()`.

**Example:**

```javascript
const AdminView = () => h.div("Admin Dashboard");
const UserView = () => h.div("User Profile");

const currentView = $.cell(UserView); // Start with UserView

h.div(
    // Dynamically renders whatever component is in `currentView`
    h(currentView, { someProp: "value" })
)

// Later: currentView.set(AdminView, true, context)
```
