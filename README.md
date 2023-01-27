     ___  ___  ___            ___  ________      
    |\  \|\  \|\  \          |\  \|\   ____\     
    \ \  \\\  \ \  \         \ \  \ \  \___|_    
     \ \  \\\  \ \  \      __ \ \  \ \_____  \   
      \ \  \\\  \ \  \ ___|\  \\_\  \|____|\  \  
       \ \_______\ \__\\__\ \________\____\_\  \ 
        \|_______|\|__\|__|\|________|\_________\
                                     \|_________|

*UI.js* is a toolkit to create interactive user interfaces in
JavaScript. It is designed to be batteries-included (components, state
management, styling and interaction) and targeting web browsers first
(no compiler or server-side JavaScript required).

Front-end development has become [quite
complicated](https://news.ycombinator.com/item?id=34218003), and our
goal is to provide a simple API to create rich UIs directly from the
browser.

## In a nutshell

See [example](https://jsfiddle.net/sorryimfrench/kvwz48hq/5/)

``` html
<!DOCTYPE html>
<html><body>
<div data-ui="Hello"></div>

<template id="Hello">
  UI.js says:
  <pre><slot out:content=".message" /></pre>
</template>

<script type="module">                                               
import ui from "https://cdn.jsdelivr.net/gh/sebastien/ui.js/src/js/ui.js";
ui(document, { message: "Hello, world!" });                                    
</script>

</body></html>
```

### Directives

-   `PATH`
-   `|TRANSFORM`
-   `!EVENT`

### Attributes

In component templates:

-   `out:ATTR=DIRECTIVE`, eg. `out:value=.label`
-   `in:EVENT=DIRECTIVE`, eg. `in:change=.label`
-   `on:EVENT=!HANDLER`, eg. `on:click=!Remove`
-   `when=DIRECTIVE`, eg. `when=empty|not`

In the document:

-   `data-component`
-   `data-state`

### Elements

-   `template`
-   `slot`

# Features

-   *Granular rendering*: an update to the data only triggers an update
    to the specific components that represent the data. This is to be
    put in contrast top VDOM-based renderes like React, where a change
    in the data will likely lead to re-rendering more than necessary.
    For applications where low latency is important (interactive
    editors), having granular updates is a must.

# References

-   [DIY UI](https://observablehq.com/@sebastien/diy-ui),
    [styling](https://observablehq.com/@sebastien/diy-ui) and [design
    tokens](https://observablehq.com/@sebastien/tokens) all served  
    as the baseline for *UI.js*.

-   [Alpine.js](https://alpinejs.dev) seems like a close relative in
    terms of approach
