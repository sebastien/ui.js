## Slots

### Expanding to a value

``` html
<slot select="path.to.value|processor" />
```

### Expanding to a registered template

``` html
<slot template="ComponentName" />
```

## Selectors

    SELECTOR  | PROCESSOR : RENDERER
    SELECTOR* | PROCESSOR : RENDERER

- Data path

- Renderer

- Expand value: `<slot out:content="SELECTOR" />` to replace the slot
  with the string-representation of the selected value(s).

- Apply template: `<slot out:content="SELECTOR:TEMPLATE" />` to apply
  the `TEMPLATE` with the selected value(s)

- Inline template: `<slot out:content="SELECTOR">TEMPLATE</slot>` to
  apply the `TEMPLATE` with the selected value(s)

### Conditionals (`do:{match,case}`)

- `<slot do:match="SELECTOR">...</slot>` with
  `<* do:case="VALUE|PREDICATE">`

### EVENTS (`on:*`)

- `<* on:click="SELECTOR!HANDLER">…`

## Selectors

Are used to select data globally (shared space) or locally
(component-specific space).

Shared space:

- `settings.theme`: absolute
- `.user.name`: relative to the current path

Component-local:

- `@items`: absolute

Special:

- `#`: current key or index in a collection
- `*`: selects a collection items, like `.items.*`, instead of the
  collection itself.
