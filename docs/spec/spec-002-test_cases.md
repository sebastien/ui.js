# UI.js test cases

We want to define a test suite that covers the key features and allows to
exercise all features in complex interactions that can also be used as
examples.

## Core Primitives (Unit Tests)

The tests to be implemented as tests/unit-core-{reactivity,effects_{terminal,structural},component}.test.js.

### Reactivity (Cells & Observables)
- `Slot` manipulation (`append`, `remove`, `insert`, `toggle`, `pop`)
- `Observable` subscriptions (`sub`/`unsub`)
- Context inheritance and isolation (Parent/Child scoping)
- `Derivation` and `Extraction`

### Terminal Effects
- `FormattingEffect` (Text, numbers, booleans, and raw DOM nodes)
- `AttributeEffect` (Dynamic properties and classes)
- `EventHandlerEffect` (Click, Input, etc.)
- `LifecycleEventHandlerEffect` (`onMount`, `onUnmount`)

### Structural Effectors
- `MappingEffect` (Arrays/Lists and Maps rendering)
- `ConditionalEffect` (Branches: `match/case` and `if/else`, `when/else`)
- `TemplateEffect` (Raw template instantiation)

### Component & Evaluation Effectors
- `ComponentEffect` (Static component mounting)
- `DynamicComponentEffect` (Dynamic component resolution)
- `ApplicationEffect` & `DynamicEvaluation` (Evaluating reactive functions in context)

## Integration Tests (Use Cases & Real-World Examples)

Each test to be built in tests/case-{name}.test.js, and importing tests/case-{name}.js where components are defined and can then be mounted in a real html file as tests/case-{name}.html.

### 1. Todolist with editable items
- **Focus:** `MappingEffect` (Array manipulation), `ConditionalEffect` (Edit vs Read modes), and Context isolation (each item manages its own edit state).
- **Interactions:** Add item, remove item, click to edit, save edit, cancel edit.

### 2. Color palette editor
- **Focus:** Bidirectional state propagation.
- **Interactions:** Modifying an RGB slider updates the hex value, and picking a preset hex value updates the RGB sliders. Tests reactive updates across sibling components.

### 3. Rich text rendering
- **Focus:** `DynamicComponentEffect`.
- **Interactions:** Rendering a tree of heterogeneous data where the component type (Paragraph, Bold, Link, CodeBlock) is dynamically determined by the data model.

### 4. Data Table with Sorting and Filtering
- **Focus:** `MappingEffect` stress test.
- **Interactions:** Ensuring that re-ordering an array doesn't destroy and recreate DOM nodes unnecessarily, and that filtering correctly unmounts and cleans up memory.

### 5. Form with Derived Validation
- **Focus:** Reactive derivations and `AttributeEffect`.
- **Interactions:** A form where a "Submit" button's `disabled` attribute is bound to a derived `Slot` that validates multiple input fields in real-time.
