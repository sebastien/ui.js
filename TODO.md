## Features

-   **tokens** for CSS styling
-   **granular update**
-   **direct loading**

## Fixes

-   `[ ]` `SlotEffector` needs to mount the nodes in order

-   `[ ]` `<slot>` are copied into the output, they should not be there
    in the rendered template. Instead they should be replaced by comment
    with a start/end. This is still the case with `structured-editor`

## Roadmap

-   `[ ]` Implement support the "more..." in the introspector, which
    implies storing local state, and transforming the input. It's a good
    simple use case for getting state management working.

-   `[ ]` state: Should pass the state store to components. All the
    patch,sub,get, in handlers should be through the environment
    (context,global,local,path).

-   `[ ]` Event: have the ability to focus a given node, for instance
    when you click on edit.

-   `[ ]` Implement local state management, and define how it used for
    components. This should probably be done by using a State proxy that
    interfaces with the store and local values as well.

-   `[ ]` Implement batching for many updates, for instance re-sorting a
    large array. Actually this can probably be done with a `set` that is
    smart and detects changes.

-   `[ ]` tokens: remove `bg=Blue.hovered` and make it `Blue.hovered.bg`

-   `[ ]` custom rules: we might still want to define custom stylesheets
    for the component.

-   `[ ]` Implement granular data update operations (create, update,
    delete, insert, remove, swap) -- or rework the way to update large
    chunks of data.

-   `[ ]` Do some baseline performance tests, in particular the
    performance of updating data structures.

-   `[ ]` XML/XSLT Support

-   `[ ]` SSR: ensure we can easily pickup rendered HTML without
    replacing content.

Done::

-   Single vs Multiple selections: `<slot out:content=".">` vs
    `<slot out:content=".*">`, basically have the ability to be explicit
    about what we want to display. If we don't support that we won't be
    able to do
    `<slot out:content=".*"><slot out:content=".|Introspector"/></slot>`

-   Match/case:
    `<slot do:match=".|type" ><div do:case="string"/></slot>` for
    conditional exclusive slots.

-   Directives: allow for selectors like `.a,.b` and `k=.a,b=.c`

-   `WhenEffectors`: their contents seems to be applied independently of
    the predicate, which is sub-optimal. This means that a when should
    act a bit like a template and control the subviews, unregistering
    them when not showing, and registering them when visible.

-   Challenge: The application of path to values needs to be much
    clearer, especially as we want to use multiple paths. This should
    also take into consideration what happens in Template and When
    effectors. → This is done through the reworked selectors which have
    inputs.

-   Challenge: When using patch, differentiate between `update`, like
    `patch("nodes.1", {x:100,y:30})` and set, which sets the value. →
    Done

## Challenges

-   Tokens depend on the corresponding module to be loaded, so we should
    pretty much always make sure the module is loaded before the
    template. This is going to be fun!

-   When removing an element from a list, all the elements get shifted
    by one.

-   When a list is re-shuffled, what happens? I think the answer to that
    is that it should be an object with ordered keys. This makes it
    possible to reuse the effectors while simply moving the order. The
    effectors would need to be updated to do that.

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
    <slot out:content=.items@TodoItem={}"/>
</ul>
```

or maybe something like

``` html
<slot out:select=".items" out:template="TodoItem" out:state="{}" />
```

## Tips

    // Lists all the topics
    BUS.topics.list().map(_ => _.path.join("."))

## Design

-   State: do we have a state tree for components (the component
    hierarchy) and one for data? I guess the answer is yes, as they can
    be orthogonal.
