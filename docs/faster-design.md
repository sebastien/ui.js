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

## Rendering

The rendering process is as follows:

- Rendering is about converting an input to an output, which is typically
  a DOM node (but not always).

- Effects drive the rendering, which is essentially triggering an effector
  based on a context containing input values and a position in the output.

- Some effects combine different effects (mapping, conditionals), and will
  delegate the rendering to one of more effects, getting

- The first step of rendering is to retrieve the input value to the effect, which is done
  by applying the input selection to the current context. This returns
  a derived context (which may be the same context) containing the input value.

- Some effects needs to create one or more sub-contexts for the sub-effects they
  use. For instance, a mapping may assign the `item` to each item of collection,
  each being rendered by a sub-effect, and therefore requiring a unique context
  as otherwise the slot `item` would be overwritten with the last value.

- On first render, the effect subscribes to updates to the value, so that if
  the value changes, the effect will re-render with the updated value.

- On subsequent renders, nothing will be done if the value doesn't change
  (most of the times, depending on the effect).

- Effects have a `unrender` method that can be used to remove/clear a previous
  render. This is typically called by composing effects or the main rendering
  function, and should clear any state, context or created node.


## Mapping

## Recursion

## Event handlers

## HTML Fragments

## SSR

SSR is about pre-rendering components and the server and then picking up
(quickly) on the client side. Baseline is to replace the component with an
updated version. This breaks down when the whole page is a component, so instead
it's about being able to replace/update components selectively based on updates,
typically when loading updated data through API requests.

## JavaScript vs HTML

Defining components in pure JavaScript is easier coming from React, but ends
up being less easy/clear than HTML annotations. Using HTML annotations have
an immediate feel to it, and reduce the amount of JavaScript required, as
most off the code is simple transform expressions.
