# Template

Templates are defined using the `template` element, the template inputs
and outputs are specified using `in:*`, `out:*` and `inout:*` attributes. See
[state](state) for more information and the data model.

```html
<template name="TodoList" in:items in:title="Example To-do List">
  <ul x:select="items.*">
    <li>
      <input type="checkbox" out:checked=".selected" />
      <input type="text" placeholder="Add title" value=".label" />
    </li>
  </ul>
  <button on:click="{scope.items.append({label:undefined,selected:false})">Add item</button>
</template>
```

# Slot



```html
<slot template="TodoList" out:items="[{label:'Buy wine'},{label:{'Buy cheese'}]">
```
