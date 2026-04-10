The fundamental principle for UI's reactivity is the ability to
subscribe to changes in values, including subsets of values. For
instance, if you have a list of todo items `[{status,label}]`, you could
watch for changes to the number of items, or changes to the `label` of
the second item.

This is called a selection, and can be defined as:

- The selected root value (the list of todo items)
- The selected path, `*` for the items, `1.label` for the label of the
  second item.

A selection can then be subscribed to, which will allow for getting
notified of changes, and therefore update the UI accordingly. Obviously,
the main problem is in detecting these changes. They can be done in
different ways:

- Explicit: providing an API so that when a value is changed, we can
  find the impacted selections and update them.
- Implicit: by walking a data structure and detecting changes,
  triggering the updates as we go.
