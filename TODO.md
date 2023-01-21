## Features

-   **tokens** for CSS styling
-   **granular update**
-   **direct loading**

## Roadmap

-   `[ ]` Implement local state management

-   `[ ]` Implement batching for many updates, for instance re-sorting a
    large array. Actually this can probably be done with a `set` that is
    smart and detects changes.

-   `[ ]` Implement granular data update operations (create, update,
    delete, insert, remove, swap) -- or rework the way to update large
    chunks of data.

-   `[ ]` Do some baseline performance tests, in particular the
    performance of updating data structures.

## Challenges

-   Tokens depend on the corresponding module to be loaded, so we should
    pretty much always make sure the module is loaded before the
    template. This is going to be fun!

-   When removing an element from a list, all the elements get shifted
    by one.

-   When a list is re-shuffled, what happens?

-   `SlotEffector` needs to mount the nodes in order

Implement something like this, which means updating the directives
support.

``` html
<ul>
    <slot out:content=".items">
        <button on:click="!Select" out:class="[..selected,#key]|.Selected"><slot out:content=".label" /></button>
    </slot>
</ul>
```

We also need to find a way to pass specific props in a sub-component

``` html
<ul>
    <slot out:content=.items|ProcessItem" data-template="TodoItem" />
</ul>
```


    ## Tips

        // Lists all the topics
        BUS.topics.list().map(_ => _.path.join("."))

    ## Design

    -   State: do we have a state tree for components (the component
        hierarchy) and one for data? I guess the answer is yes, as they can
        be orthogonal.
