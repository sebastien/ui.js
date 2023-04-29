import { createTemplate } from "./templates.js";
import { onWarning, onError } from "./utils.js";

// --
// # Loading
//
// This defines the infrastructure to dynamically load JavaScript, HTML and
// XML (with XSLT) definitions of components.

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

// Fetches the XML document. Note that unlink `fetch()`, this set the
// `baseURI`, which is required by the XSLTProcessor when the stylesheet
// contains imports.
export const fetchXML = (url) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Configure the request
    xhr.open("GET", url, true);
    xhr.responseType = "document";
    xhr.overrideMimeType("text/xml");

    // Define the 'onload' event handler
    xhr.onload = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        // The request has successfully completed, and the XML document is available as 'xhr.responseXML'
        const xmlDoc = xhr.responseXML;
        resolve(xmlDoc);
      } else {
        onError(`loading.fetchXML: Could not load document at ${url}`, {
          status: xhr.statusText,
          url,
        });
        reject(new Error(`Unable to load XML at ${url}: ${xhr.statusText}`));
      }
    };

    // Define the 'onerror' event handler
    xhr.onerror = function () {
      onError(
        `loading.fetchXML: Could not load document at ${url}: request failed`,
        {
          url,
        }
      );
      reject(new Error(`Unable to load XML at ${url}: request failed`));
    };

    // Send the request
    xhr.send();
  });

export const loadXML = async (uri, remove = true) =>
  uri instanceof Array
    ? Promise.all(uri.map((_) => loadXML(_, remove)))
    : // As noted before, the `fetchXML` will preserve the baseURI.
      fetchXML(uri).then((xmlDoc) => {
        // This extracts the xml-stylesheet from the processing instruction.
        // int the XML document, if it's there.
        const url = new URL(uri, window.location.href).href;
        const n = xmlDoc.firstChild;
        if (!n) {
          return onError("XML document is empty", { xmlDoc, url });
        } else if (
          n.nodeType !== Node.PROCESSING_INSTRUCTION_NODE ||
          n.nodeName !== "xml-stylesheet"
        ) {
          return xmlDoc;
        } else {
          // This is a lazy trick to extract the value from the PI node, as
          // it's only available as text.
          let d = document.createElement("div");
          d.innerHTML = `<span ${n.nodeValue}>_</span>`;
          const href = d.firstChild.getAttribute("href");
          // We fetch the XSLT stylesheet and transform the XML document with it.
          return loadXSLT(new URL(href, url).href).then((xslt) => {
            // There may be more than one node
            return xslt.transformToFragment(xmlDoc, document);
          });
        }
      });

const Cache = new Map();
export const loadXSLT = async (url) => {
  if (Cache.has(url)) {
    return Cache.get(url);
  } else {
    const res = fetchXML(url).then((xsl) => {
      // parse the XSLT stylesheet as an XML DOM object
      var xsltProcessor = new XSLTProcessor();
      xsltProcessor.importStylesheet(xsl);
      return xsltProcessor;
    });
    // We cache so that multiple calls got resolved to the same future.
    Cache.set(url, res);
    return res;
  }
};

export const loadHTML = async (url, remove = true) =>
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
      extractNodes(doc, stylesheets, scripts, remove);
      doc.querySelectorAll("template").forEach((_) => {
        extractNodes(_.content, stylesheets, scripts, remove);
        templates.push(createTemplate(_));
      });
      // We support .template for dynamically loaded chunks, which supports
      // preview.
      doc.querySelectorAll(".template").forEach((_) => {
        extractNodes(_, stylesheets, scripts, remove);
        templates.push(createTemplate(_));
      });
      return { stylesheets, scripts, templates };
    });

// --
// Extracts scripts and styles from a given node.
const extractNodes = (node, stylesheets = [], scripts = [], remove = true) => {
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
          remove && _.parentElement.removeChild(_);
        }
      });
    }
  });
  return { stylesheets, scripts };
};

// -- doc
// Loads the XML templates defined at the given `url` (or a list of urls).
export const loadXMLTemplates = async (url) => {
  const sources = await loadXML(url instanceof Array ? url : [url]);
  const templates = [];
  const stylesheets = [];
  const scripts = [];
  sources.map((_) =>
    loadTemplates(_, undefined, false, templates, stylesheets, scripts)
  );
  return { templates, stylesheets, scripts };
};

// --
// Looks for `template` nodes in the given `node`, dynamically loading their
// definition if a `data-src=URI` is present.
export const loadTemplates = async (
  node,
  // We support both `template` and `.templates`.
  selectors = ["template", ".template"],
  remove = true,
  templates = [],
  stylesheets = [],
  scripts = []
) => {
  const promises = [];
  const roots =
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
    node.nodeType === Node.DOCUMENT_NODE
      ? [...node.childNodes].filter((_) => _.nodeType === Node.ELEMENT_NODE)
      : [node];
  for (const selector of selectors) {
    for (const n of roots) {
      for (const tmpl of n.querySelectorAll(selector)) {
        // This will register the templates in `templates`
        const src = tmpl.dataset.src;
        if (src) {
          promises.push();
        } else {
          extractNodes(
            tmpl.content ? tmpl.content : tmpl,
            remove && !tmpl.dataset.keep
          );
          templates.push(createTemplate(tmpl));
        }
        remove && !tmpl.dataset.keep && tmpl.parentElement.removeChild(tmpl);
      }
    }
  }
  return Promise.all(promises).then(() => ({
    templates,
    stylesheets,
    scripts,
  }));
};

// EOF
