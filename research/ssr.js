// This is for Deno
import { createComponent } from "../src/js/ui/components.js";
import { loadTemplates } from "../src/js/ui/loading.js";
import { parseHTML } from "../deps/domish/src/js/xmlish.js";
import DOM from "../deps/domish/src/js/domish.js";

// We register the DOM
Object.assign(globalThis, DOM);

const template = `
<template name="HelloWorld" in:message>
<p out:content=".message">…</p>
</template>
`;

const html = `
<html>
<div template="HelloWorld" out:message="Hello, World!"></div>
</html>
`;

for (const node of parseHTML(html)) {
	console.log(node.toXML());
	loadTemplates(node);
}
