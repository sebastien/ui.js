# UI.js Performance

UI.js is designed (and implement) with performance in mind, which is
based on the following principles:

-   **Granular rendering**: the idea is to be able to re-render
    arbitrary subsets of any component when a particular piece of data
    changes. This leads to not having to traverse a component tree, but
    directly find the components that need to be updated.

-   **Leveraging the DOM**: we use `template` nodes and `cloneNode` to
    create and reuse fragments that we need to combine into templates.
    This saves many costly back-and-forth between the JavaScript runtime
    and the native DOM implementation.

-   **Reusing values**: we try to minimise the creation of values, and
    to keep created values as long as we can, so that we limit strain on
    the garbage collector.

Areas to improve:

-   Initial template creation requires multiple traversals of DOM
    subtrees, which should be optimised.
