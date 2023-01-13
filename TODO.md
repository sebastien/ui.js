## Roadmap

-   `[X]` Add `path` property to any rendered component, so that it is
    mapped to the state tree.

-   `[X]` Have event handlers find the current state based on the
    ancestors, and use that to dispatch information.

-   `[ ]` Implement component lifecycle (create, update, delete)

## Design

-   State: do we have a state tree for components (the component
    hierarchy) and one for data? I guess the answer is yes, as they can
    be orthogonal.
