
# `out:*`, `out:content`

In a generic HTML, this overrides the attribute or content of the node with
the content of the expression:

```html
1 + 1 = <slot out:content="{1 + 1}" />
```

```html
<template name="content" in:placeholder>
<input out:placeholder />
<slot out:content="{1 + 1}" />
</template>
<slot template="content" out:placeholder="{'Type something here…'}" />
```

In a slot:

```html
<slot template="User" out:name="{'Alice'}" out:email="{'alice@gmail.com'}" />
<template name="User">
  <slot out:content="name" />
  <a out:href="{`mailto:${email.value}`}" out:content="email"></a>
</template>
```



# `in:*`

Binds the slot from the rendered template into the current scope.

```html
<template apply>
<slot template="TextField" in:text placeholder="Type something" />
You typed: <span out:content="text" />
</template>
```

# `inout:*`

TODO

# `do:for`

# `do:match` … `do:case`

# `do:when`


