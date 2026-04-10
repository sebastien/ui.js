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
