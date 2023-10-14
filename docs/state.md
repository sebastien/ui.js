# Cells

Data is stored in *cells*, which typically offer the following operations:

- `.value` to access their value
- `.set(value)` to change their value
- `.update(value)` to modify/merge their value (for lists/maps)
- `.[un]sub(callback)` to subscribe/unsubscribe to updates

There are different of cells, depending on their usage:

- *Input and output cells*, these are typically used to manage a component's
  inputs (like `props` in React) and outputs (values produced or updated).

- *Internal cells*, these are typically only used by a component, used to track
  its internal state, such as intermediate computations, retrieved data, etc.

Cells are *named* and are part of a [scope](#scope). Some cells can be created
by combining other cells, for instance taking `a` and `b` and returning `a +
b`, in which case they are read-only.

Cells support asynchronous operations natively, and form the basis for 
reactive programming.

# Scope

A scope is a collection of [cells](#cells), very much like a scope in
JavaScript. Scopes can be nested, and will then share their cells. As expected,
if a child scope defines a cell with the same name as part scope, the child's
cell will prevail.

In the example below, the `Item` template defines a scope with two cells
`label` and `status`. Each `slot` applying `Item` will create a new scope
and bind the `label` and `status` values to the cells.

```html
<template name="Item" in:label in:status />
Things to do:
<ul>
  <li><slot template="Item" label="Buy Cheese" status="done" /><li>
  <li><slot template="Item" label="Buy Wine" status="todo" /><li>
</ul>
```

# Selector

A selector represents a path to extract a subset of the data. If you are
familiar with [jQuery](https://jquery.com/),
[XPath](https://en.wikipedia.org/wiki/XPath) or
[JSONPath](https://datatracker.ietf.org/doc/id/draft-goessner-dispatch-jsonpath-00.html),
it a similar idea of writing simple expressions to retrieve data.

For instance, given the following data

```javascript
{
  name:"Alice",
  todo:[
    {label:"Buy Wine"},
    {label:"Buy Cheese"},
  ]
}
```

We can retrieve `["Buy Wine", "Buy Cheese"]` by selecting `"todo.*.label"`.

# Store

The store is a global, shared tree-like data structure that can be used persist
data in an application. The store has a global namespace, used for data that
may be shared across sessions and users in a multiplayer context, and a local
namespace used for the current session only.

Data in the store can be subscribed to, and can is designed to be easily 
persisted to stores
