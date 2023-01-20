## Roadmap

-   `[ ]` Implement batching for many updates, for instance re-sorting a
    large array. Actually this can probably be done with a `set` that is
    smart and detects changes.

-   `[ ]` Implement granular data update operations (create, update,
    delete, insert, remove, swap) -- or rework the way to update large
    chunks of data.

-   `[ ]` Do some baseline performance tests, in particular the
    performance of updating data structures.

## Challenges

-   When removing an element from a list, all the elements get shifted
    by one.

-   When a list is re-shuffled, what happens?

-   `SlotEffector` needs to mount the nodes in order

Implement something like this, which means updating the directives
support.

        <ul">
            <slot out:content=".items">
                <button on:click="!Select" out:class="[..selected,#key]|.Selected"><slot out:content=".label" /></button>
            </slot>
        </ul>


    ## Tips

        // Lists all the topics
        BUS.topics.list().map(_ => _.path.join("."))

    ## Design

    -   State: do we have a state tree for components (the component
        hierarchy) and one for data? I guess the answer is yes, as they can
        be orthogonal.
