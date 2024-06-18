# Design


- Cells/Slots?
- Derivations/Templates
- Context
- Effects


## Context

Templates and effects wrap state in *slots/cells*, which have a unique numerical
identifier. Now, the actual value of a slot or cell depends on a *context*.  For instance,
an inspector component would be recursive when displaying an array or a map, so its
`value` slot would be bound to different values depending on the context.

Just like a function call, a component rendering defines a new context, which
then can hold values for slots and cells without risking a conflict. Within the
boundaries of components, contexts can be specialized using prototypical inheritance,
which allows for shadowing cell values, for instance, when iterating over a sequence.

## Mapping

## Recursion

## Event handlers

## HTML Fragments

