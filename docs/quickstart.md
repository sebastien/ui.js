# Quickstart

Use `src/js/ui` as the default runtime.

```html
<html>
  <head>
    <meta charset="utf-8" />
    <script type="importmap">
      {
        "imports": {
          "@ui/": "https://cdn.jsdelivr.net/gh/sebastien/ui.js/src/js/ui/"
        }
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { render } from "@ui/client.js";
      import { h } from "@ui/hyperscript.js";

      const App = ({ message }) => h.div(message.text());

      render(App, { message: "Hello, world!" }, document.getElementById("app"));
    </script>
  </body>
</html>
```

## Web Components

You can also register a `ui.js` component as a native custom element.

```html
<html>
  <head>
    <meta charset="utf-8" />
    <script type="importmap">
      {
        "imports": {
          "@ui/": "https://cdn.jsdelivr.net/gh/sebastien/ui.js/src/js/ui/"
        }
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { h } from "@ui/hyperscript.js";
      import webcomponent from "@ui/webcomponents.js";

      const Counter = ({ count }) =>
        h.div(
          h.button({ onclick: () => count.set((count.get() || 0) - 1) }, "-"),
          h.span(count.text()),
          h.button({ onclick: () => count.set((count.get() || 0) + 1) }, "+")
        );

      webcomponent("my-counter", Counter, { count: 0 });

      document.getElementById("app").innerHTML =
        "<my-counter count=\"5\"></my-counter>";
    </script>
  </body>
</html>
```

Changing the `count` attribute later updates the wrapped component reactively.
