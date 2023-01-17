## Roadmap

-   `[ ]` Implement component lifecycle (create, update, delete)

-   `[ ]` Implement granular data update operations (create, update,
    delete, insert, remove, swap)

-   `[ ]` Implement input handlers.

-   `[ ]` Implement batching for many updates, for instance re-sorting a
    large array. Actually this can probably be done with a `set` that is
    smart and detects changes.

-   `[ ]` Do some baseline performance tests, in particular the
    performance of updating data structures.

## Challenges

-   When removing an element from a list, all the elements get shifted
    by one.

-   When a list is re-shuffled, what happens?

## Tips

    // Lists all the topics
    BUS.topics.list().map(_ => _.path.join("."))

## Design

-   State: do we have a state tree for components (the component
    hierarchy) and one for data? I guess the answer is yes, as they can
    be orthogonal.
