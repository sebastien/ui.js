import { Templates, createTemplate } from "./templates.js";
import { onWarning, onError, onInfo, onDebug } from "./utils/logging.js";

// --
// # Loader
//
// A simple structure that keeps track of the loaded resources, loading them
// once and allowing for synchronization.

class AssetLoader {
	constructor() {
		this.memoized = new Map();
		this.pending = 0;
	}

	load(key, args, creator) {
		if (typeof key !== "string") {
			onError("Loader.memo key should be a string", {
				type: typeof key,
				key,
			});
		}
		if (this.memoized.has(key)) {
			return this.memoized.get(key);
		} else {
			onDebug(`Loader.loading asset "${key}"`);
			const res = creator(...args);
			const self = this;
			this.pending += 1;
			res.then(() => {
				self.pending -= 1;
			});
			this.memoized.set(key, res);
			return res;
		}
	}

	join() {
		return Promise.all([...this.memoized.values()]);
	}
}

export const Loader = new AssetLoader();

// --
// # Loading
//
// This defines the infrastructure to dynamically load JavaScript, HTML and
// XML (with XSLT) definitions of components.

// --
// Injects the given JavaScript `source` as a JavaScript module. Note that
// this is not used directly in this module.
export const createModule = async (source) => {
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
	Loader.load(
		`fetchXML:${url}`,
		[url],
		(url) =>
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
						onError(
							`loading.fetchXML: Could not load document at ${url}`,
							{
								status: xhr.statusText,
								url,
							}
						);
						reject(
							new Error(
								`Unable to load XML at ${url}: ${xhr.statusText}`
							)
						);
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
					reject(
						new Error(
							`Unable to load XML at ${url}: request failed`
						)
					);
				};

				// Send the request
				xhr.send();
			})
	);

export const loadXML = (uri) =>
	uri instanceof Array
		? Promise.all(uri.map((_) => loadXML(_)))
		: Loader.load(`loadXML:${uri}`, [uri], (uri) =>
				// As noted before, the `fetchXML` will preserve the baseURI.
				fetchXML(uri).then((xmlDoc) => {
					// This extracts the xml-stylesheet from the processing instruction.
					// int the XML document, if it's there.
					const url = new URL(uri, window.location.href).href;
					if (!xmlDoc) {
						return onError(
							"Could not load XML document, it may be malformed.",
							{
								xmlDoc,
								url,
							}
						);
					}
					const n = xmlDoc.firstChild;
					if (!n) {
						return onError("XML document is empty", {
							xmlDoc,
							url,
						});
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
						return loadXSLT(new URL(href, url).href).then(
							(xslt) => {
								// There may be more than one node
								return xslt.transformToFragment(
									xmlDoc,
									document
								);
							}
						);
					}
				})
		  );

export const loadXSLT = (url) =>
	Loader.load(`loadXSLT:${url}`, [url], (url) =>
		fetchXML(url).then((xsl) => {
			// parse the XSLT stylesheet as an XML DOM object
			const xsltProcessor = new XSLTProcessor();
			xsltProcessor.importStylesheet(xsl);
			return xsltProcessor;
		})
	);

export const loadHTML = (url) =>
	Loader.load(`loadHTML:${url}`, [url], (url) =>
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
			})
	);

// --
// Extracts scripts and styles from a given node.
const extractNodes = (node, remove = true) => {
	const stylesheets = [];
	const scripts = [];
	[
		["style", stylesheets],
		["STYLE", stylesheets],
		["script", scripts],
		["SCRIPT", scripts],
	].forEach(([name, collection]) => {
		if (!node?.querySelectorAll) {
			onWarning(
				"[ui.js] loading.extractNodes: Could not expand template of scope",
				node
			);
		} else {
			node.querySelectorAll(name).forEach((_) => {
				// Nodes marked as `data-skip` are skipped.
				if (!_.getAttribute("data-skip")) {
					collection.push(_);
					remove && _.parentElement?.removeChild(_);
				}
			});
		}
	});
	return { stylesheets, scripts };
};

export const loadXMLTemplates = async (url) =>
	await Promise.all(
		(url instanceof Array ? url : [url]).map((url) => loadXMLTemplate(url))
	).then((_) =>
		_.reduce(
			(r, { templates, stylesheets, scripts }) => {
				r.templates = r.templates.concat(templates);
				r.stylesheets = r.stylesheets.concat(stylesheets);
				r.scripts = r.stylesheets.concat(scripts);
				return r;
			},
			{ templates: [], stylesheets: [], scripts: [] }
		)
	);

// -- doc
// Loads the XML templates defined at the given `url` (or a list of urls).
export const loadXMLTemplate = (url) =>
	Loader.load(`loadXMLTemplate:${url}`, [url], (url) =>
		loadXML(url).then((node) =>
			loadTemplates(node).then(({ scripts, stylesheets, templates }) => {
				templates.forEach((_) => registerTemplate(_.name, _));
				scripts.forEach((_) => registerScript(_));
				stylesheets.forEach((_) => registerStylesheet(_));
				onInfo(
					"loading.loadXMLTemplate: Loaded template",
					{ url },
					{ scripts, stylesheets, templates }
				);
				if (templates.length == 0) {
					onError(
						"loadXMLTemplate: url did not contain any template",
						url,
						{
							node,
							templates,
							scripts,
							stylesheets,
						}
					);
				}
				return { scripts, stylesheets, templates };
			})
		)
	);

const registerTemplate = (template) => Templates.set(template.name, template);
const registerScript = (script) => {
	document.head.appendChild(script);
};
const registerStylesheet = (stylesheet) => {
	document.head.appendChild(stylesheet);
};

//   const {templates, stylesheets, scripts} = await loadTemplates(node);
//       res.then(() => {
//         // The expectation is the XSLT-rendered XML files will have their scripts
//         // and styles defined as `data-template=true`.
//         for (const node of [..._.childNodes]) {
//           for (const child of iterSelector(
//             node,
//             "script[data-template='true']"
//           )) {
//             res.scripts.push(child);
//           }
//           for (const child of iterSelector(
//             node,
//             "style[data-template='true']"
//           )) {
//             stylesheets.push(child);
//           }
//         }
//       });
//       return res;
//     })
//   );
//   // If register is set, we register the scripts and stylesheets in the document.
//   if (register) {
//     scripts && scripts.forEach((_) => document.head.appendChild(_));
//     if (stylesheets && stylesheets.length) {
//       const css = stylesheets
//         .reduce((r, v) => {
//           r.push(v.innerText);
//           return r;
//         }, [])
//         .join("\n");
//       let styleNode = document.getElementById("uijs-stylesheet");
//       if (!styleNode) {
//         styleNode = document.createElement("style");
//         styleNode.setAttribute("id", "uijs-stylesheet");
//         document.head.appendChild(styleNode);
//       }
//       styleNode.appendChild(document.createTextNode(css));
//     }
//   }
//   return { templates, stylesheets, scripts };
//};

// --
// Looks for `template` nodes in the given `node`, dynamically loading their
// definition if a `data-src=URI` is present.
export const loadTemplates = (
	node,
	// We support both `template` and `.templates`.
	selectors = ["template", ".template"]
) => {
	const promises = [];
	const templates = [];
	const stylesheets = [];
	const scripts = [];
	const roots =
		node && node instanceof Array
			? node.filter((_) => _.nodeType === Node.ELEMENT_NODE)
			: !node
			? []
			: node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
			  node.nodeType === Node.DOCUMENT_NODE
			? [...node.childNodes].filter(
					(_) => _.nodeType === Node.ELEMENT_NODE
			  )
			: [node];
	for (const selector of selectors) {
		for (const n of roots) {
			// The root may match the selector itself, so we need to insert it
			const matches = [...n.querySelectorAll(selector)];
			if (n.matches(selector)) {
				matches.splice(0, 0, n);
			}
			for (const tmpl of matches) {
				// This will register the templates in `templates`
				const src = tmpl.dataset.src;
				if (src) {
					onError(
						"[uijs] loading.loadTemplates: dynamically loading templates not supported yet",
						src
					);
					// TODO: We should probably make it sync
					promises.push();
				} else {
					const nodes = extractNodes(
						tmpl.content ? tmpl.content : tmpl,
						!tmpl.dataset.keep
					);
					stylesheets.push.apply(stylesheets, nodes.stylesheets);
					scripts.push.apply(scripts, nodes.scripts);
					templates.push(createTemplate(tmpl));
				}
				!tmpl.dataset.keep && tmpl.parentElement?.removeChild(tmpl);
			}
		}
	}
	onDebug(
		"loading.loadTemplates: Loaded templates",
		templates.map((_) => _.name),
		{ scripts, stylesheets }
	);
	return Promise.resolve({
		templates,
		stylesheets,
		scripts,
	});
};

// EOF
