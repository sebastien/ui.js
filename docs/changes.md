# UIjs Changes

This outlines the key changes made to UIjs's architecture and
implementation, giving a view on the different avenues considered and
their evolution.

## State management

- Controllers now use a declarative way to define the reactive state
  network, transparently interacting with the local and global state.

## Selector simplification

- Selectors are all relative now, instead of being absolute. We can do
  absolute selection for the binding, and access parent through `..`.
