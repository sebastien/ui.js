// This is for Deno
import { createComponent } from "../src/js/ui/components.js";
import { loadTemplates } from "../src/js/ui/loading.js";
import { parseHTML } from "../deps/domish/src/js/xmlish.js";
import DOM from "../deps/domish/src/js/domish.js";

// We register the DOM
Object.assign(globalThis, DOM);

const template = `<template name="HelloWorld" in:message><p out:content=".message">…</p></template>`;

const html = `<html><slot class="asdas" template="HelloWorld" out:message="Hello, World!"></slot></html>`;

console.log("====", new Date());
const applyTemplates = (nodes, data = {}) => {
	const res = [];
	for (const node of nodes) {
		for (const n of node.querySelectorAll("slot[template]")) {
			res.push(createComponent(n, data));
		}
	}
	return res;
};

// TODO: Template nodes are loaded twice with DOMish
console.log("XXX");
const tmpl = await loadTemplates(parseHTML(template));

// Apply templates mutates the nodes, so we need to keep references to them
const nodes = [...parseHTML(html)];
const components = applyTemplates(nodes, {});
for (const node of nodes) {
	console.log(node.toXML());
}
// EOF
