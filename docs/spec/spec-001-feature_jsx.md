# JSX Support

We want to allow for writing `ui` templates as JSX.

## Background

Currently, templates are written using the `h` hyperscript helper, which exposes a Proxy to dynamically create Virtual DOM elements:

```javascript
import { h } from "@ui/hyperscript.js";
const App = ({ message }) => h.div({ class: "app" }, message);
```

While this is concise, many developers prefer standard JSX syntax, which provides better tooling and familiarity:

```jsx
const App = ({ message }) => <div class="app">{message}</div>;
```

## Requirements

1. **Classic JSX Pragma:** The existing `createElement` function (wrapped by `h`) already supports classic JSX semantics (`h(type, props, ...children)`). We need to document how to use it with compilers like Babel, TypeScript, and Vite.
2. **Modern JSX Runtime:** Support the React 17+ JSX transform by providing a standard `jsx-runtime` module inside `src/js/ui/jsx-runtime.js`.
3. **Fragments:** Complete the implementation for Fragments (`<>...</>`). The underlying `VNode` supports DocumentFragments via the `#fragment` node name, but `h.Fragment` needs to be formally exposed and integrated into both the proxy and the JSX runtime.

## Implementation Details

### 1. Modern JSX Runtime (`src/js/ui/jsx-runtime.js`)

Create a new entry point that implements the standard JSX runtime API, mapping the modern API calls back to the existing `createElement` logic through `h`.

```javascript
import { h } from "./hyperscript.js";

// VNode natively supports DocumentFragments when node name is "#fragment"
export const Fragment = "#fragment";

export const jsx = (type, props, key) => {
  const { children, ...attributes } = props || {};
  // Handle key if necessary
  
  if (children !== undefined) {
    if (Array.isArray(children)) {
      return h(type, attributes, ...children);
    } else {
      return h(type, attributes, children);
    }
  }
  return h(type, attributes);
};

export const jsxs = jsx;
```

### 2. Fragment Support in Hyperscript

Update `src/js/ui/hyperscript.js` to correctly expose and handle `Fragment`. Currently, it contains a placeholder comment `// TODO: Support h.Fragment`.

When the proxy accesses the `Fragment` property, it should return `"#fragment"`. This ensures `<h.Fragment>...</h.Fragment>` transpiles seamlessly and maps to `VNode`'s internal handling of `#fragment`.

### 3. Documentation & Usage

Update `README.md` or a dedicated usage guide to show developers how to configure their build tools:

**tsconfig.json**
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@ui"
  }
}
```

**Babel / Vite Config**
```javascript
{
  "plugins": [
    ["@babel/plugin-transform-react-jsx", {
      "runtime": "automatic",
      "importSource": "@ui"
    }]
  ]
}
```

## Migration / Compatibility

This feature is completely additive. Existing `h.*` usages will continue to work exactly as before with zero breaking changes.
