# out:*

Sends out the slot in read-only to the given template.

```html
<slot template="User" out:name="Alice" out:email="alice@gmail.com" />
<template name="User">
  <slot out:content="name" />
  <a out:href="{`mailto:${email.value}`}" out:content="email"></a>
</template>
```


# in:*

Binds the slot from the rendered template into the current scope.

```html
<template apply>
<slot template="TextField" in:text placeholder="Type something" />
You typed: <span out:content="text" />
</template>
```

# inout:*


