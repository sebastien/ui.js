     ___  ___  ___            ___  ________
    |\  \|\  \|\  \          |\  \|\   ____\
    \ \  \\\  \ \  \         \ \  \ \  \___|_
     \ \  \\\  \ \  \      __ \ \  \ \_____  \
      \ \  \\\  \ \  \ ___|\  \\_\  \|____|\  \
       \ \_______\ \__\\__\ \________\____\_\  \
        \|_______|\|__\|__|\|________|\_________\
                                     \|_________|

*UI.js* is a toolkit to create interactive user interfaces in
JavaScript. UIjs is lightweight and fast, supports fine-grained granularity,
components and comes fully equipped to do rich UIs.

## In a nutshell

See [example](https://jsfiddle.net/sorryimfrench/kvwz48hq/5/)

``` html
<!DOCTYPE html>
<html><body>
<div id="Hello"></div>

<script type="importmap">
{
  "imports": {
    "@ui": "https://cdn.jsdelivr.net/gh/sebastien/ui.js/src/js/ui.js"
  }
}
</script>

<script type="module">
import { render, h } from "@ui";

const Hello = ({ message }) => h.div("UI.js says: ", h.pre(message.text()));
render(Hello, { message: "Hello, world!" }, document.getElementById("Hello"));
</script>

</body></html>
```

### API

- `render(Component, data, node)`: Mounts a component to a DOM node.
- `ui(Component, data, node)`: Alias for `render`.
- `h`: Hyperscript helpers (`h.div`, `h.span`, ...) for constructing UI elements.
- `$`: Creates reactive state cells.
- `select`: Creates reactive DOM selections.
- `webcomponent(name, Component, initial?)`: Registers a custom element exposing a UI.js component.
- `globals`: Object exposing the global context.

### Web Components

You can expose any `ui.js` component as a native custom element:

```html
<div id="app"></div>

<script type="module">
import { h, webcomponent } from "./src/js/ui.js";

const Counter = ({ count }) =>
	h.div(
		h.button({ onclick: () => count.set((count.value || 0) - 1) }, "-"),
		h.span(count.text()),
		h.button({ onclick: () => count.set((count.value || 0) + 1) }, "+")
	);

webcomponent("my-counter", Counter, { count: 0 });

document.getElementById("app").innerHTML = "<my-counter count=\"5\"></my-counter>";
</script>
```

Attribute updates are reactive, so changing `count` on `<my-counter>`
updates the wrapped component state.

# Features

- *Granular rendering*: updates target the minimal DOM surface.
- *No build step required*: runs directly in browsers with ESM.
- *Small reactive primitives*: selections, cells, and template effects.

# References

- [DIY UI](https://observablehq.com/@sebastien/diy-ui),
  [styling](https://observablehq.com/@sebastien/diy-ui) and [design
  tokens](https://observablehq.com/@sebastien/tokens) all served
  as the baseline for *UI.js*.

- [Alpine.js](https://alpinejs.dev) a close relative in terms of
  approach, where the focus is on writing HTML.

- [Design Kit](https://kit.design/), a CSS library that simplifies the
  problem space.
