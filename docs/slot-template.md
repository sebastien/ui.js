# Slot-Template junction

The slot-template junction is one of the most important mechanism in the library. It happens in the following context.

```html
<!-- Form defines a 'username' cell, Input defines a `value` cell and the slot
maps the `username` to the input's value.-->
<template name="Form" inout:username >
<slot template="Input" name="'username'" label="'Username'" placeholder="'Enter username'" value="username"></slot>
</template>
<template name="Input" in:name in:label in:placeholder inout:value>
<label out:for="name" out:content="label"></label>
<input type="value" out:value="value" on:value="value=event->{event.target.value}" />
</template>
```

Now this is what happens: the `Form` template has a scope with the `username`
cell.

```
Form:
```

When the `<slot>` directive happens, a new scope is created that binds
the cell `username` to the slot `value`, and then assigns the `label`, `name` and `placeholder`
slots as literals.

The `slot` scope does not inherit the parent scope, but instead cherry-picks
the cells from the parent scope and assigns them to slots in the current scope.

```
template(Input):
  - value
  - name, label, placeholder

``


template(Form):
    - username=cell(0)
    args(template=Input):
      - value=cell(0)
      - name=value("username")
      - label=value("Username")
      - placeholder=value("Enter username")
      - applied(Input):
        - value=slot.value
```



