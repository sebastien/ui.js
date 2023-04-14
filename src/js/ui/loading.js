import { createTemplate } from "./templates.js";
import { onWarning, onError } from "./utils.js";

// --
// # Loading
//
// This defines the infrastructure to dynamically load JavaScript and HTML
// definitions of components.

// --
// Loads the given JavaScript `source` as a JavaScript module.
export const loadModule = async (source) => {
  // FIXME: We should probably rewrite the paths
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  // Dynamically import and execute the module
  try {
    const module = await import(url);
    return module;
  } catch (error) {
    // NOTE: If the script imports modules relatively to its HTML file, this
    // won't work as it won't resolve.
    onError(
      "loadModule: Unable to dynamically import JavaScript module:",
      error,
      source
    );
  } finally {
    // Clean up the URL to release the memory
    URL.revokeObjectURL(url);
  }
};

export const loadHTML = async (url) =>
  fetch(url)
    .then((_) => _.text())
    .then((_) => {
      const format =
        _.indexOf("http://www.w3.org/1999/xhtml") === -1
          ? "text/html"
          : "application/xhtml+xml";
      const doc = new DOMParser().parseFromString(_, format);
      const stylesheets = [];
      const scripts = [];
      const templates = [];
      extractNodes(doc);
      doc.querySelectorAll("template").forEach((_) => {
        extractNodes(_.content, stylesheets, scripts);
        templates.push(createTemplate(_));
      });
      // We support .template for dynamically loaded chunks, which supports
      // preview.
      doc.querySelectorAll(".template").forEach((_) => {
        extractNodes(_, stylesheets, scripts);
        templates.push(createTemplate(_));
      });
      return { stylesheets, scripts, templates };
    });

// --
// Extracts scripts and styles from a given node.
const extractNodes = (node, stylesheets = [], scripts = []) => {
  [
    ["style", stylesheets],
    ["STYLE", stylesheets],
    ["script", scripts],
    ["SCRIPT", scripts],
  ].forEach(([name, collection]) => {
    if (!node?.querySelectorAll) {
      onWarning(
        "[loading.extractNodes] Could not expand template of scope",
        node
      );
    } else {
      node.querySelectorAll(name).forEach((_) => {
        // Nodes marked as `data-skip` are skipped.
        if (!_.getAttribute("data-skip")) {
          collection.push(_);
          _.parentElement.removeChild(_);
        }
      });
    }
  });
  return { stylesheets, scripts };
};

// --
// Looks for `template` nodes in the given `node`, dynamically loading their
// definition if a `data-src=URI` is present.
export const loadTemplates = async (node) => {
  const promises = [];
  const templates = [];
  const stylesheets = [];
  const scripts = [];

  for (let tmpl of node.querySelectorAll("template")) {
    // This will register the templates in `templates`
    const src = tmpl.dataset.src;
    if (src) {
      promises.push();
    } else {
      extractNodes(tmpl.content);
      templates.push(createTemplate(tmpl));
    }
    tmpl.parentElement.removeChild(tmpl);
  }
  return Promise.all(promises).then(() => ({
    templates,
    stylesheets,
    scripts,
  }));
};

// EOF
