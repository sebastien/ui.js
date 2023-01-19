     ___  ___  ___            ___  ________      
    |\  \|\  \|\  \          |\  \|\   ____\     
    \ \  \\\  \ \  \         \ \  \ \  \___|_    
     \ \  \\\  \ \  \      __ \ \  \ \_____  \   
      \ \  \\\  \ \  \ ___|\  \\_\  \|____|\  \  
       \ \_______\ \__\\__\ \________\____\_\  \ 
        \|_______|\|__\|__|\|________|\_________\
                                     \|_________|

*UI.js* is an old-school designed, modern JavaScript UI library.
Front-end development has become [quite
complicated](https://news.ycombinator.com/item?id=34218003), and our
goal is to provide a simple API to create rich UIs directly from the
browser.

## In a nutshell

``` html
<!DOCTYPE html>
<html><body>
<div data-component="Hello" data-state="'Hello, World!'">
<template id="Hello">
UI.js says: <pre out:contents="." />
</template>
<script type="module">
import ui from "https://jsdeliver.com/gh/sebastien/ui.js/src/js/ui.js";
ui();
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
