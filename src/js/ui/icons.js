// Project: LittleUI
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: features/icons
// Provides a flexible, CDN-based icon loading system supporting multiple icon
// libraries with automatic caching and two rendering modes: <use> references
// (default) and inline SVG content for Web Components.
//
// Example:
// ```javascript
// import { icon, IconSources, install } from "littleui/features/icons";
//
// // Basic usage
// const settingsIcon = icon("settings");
//
// // With specific source
// const homeIcon = icon("home", { source: IconSources.lucide });
//
// // Register web component
// install("ui-icon");
// ```
//
// Then in HTML:
// ```html
// <ui-icon name="home"></ui-icon>
// <ui-icon name="check" size="2em" source="Iconoir"></ui-icon>
// ```

// Constant: SVG_NAMESPACE
// The SVG XML namespace URI.
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Constant: DEFAULT_SOURCE_NAME
// The default icon source key used when no explicit source is provided.
const DEFAULT_SOURCE_NAME = "iconoir";

// Constant: ICON_NAME_TOKEN
// Placeholder replaced with the requested icon name in source URLs.
const ICON_NAME_TOKEN = "__ICON_NAME__";

// ----------------------------------------------------------------------------
// SECTION: Icon Sources
// ----------------------------------------------------------------------------

/**
 * Preconfigured CDN sources for popular icon libraries.
 *
 * @type {Object.<string, IconSource>}
 */
const IconSources = {
	devicons: {
		url: `https://unpkg.com/devicons@1.8.0/!SVG/${ICON_NAME_TOKEN}.svg`,
		size: [32, 32],
		style: {
			stroke: "transparent",
			fill: "var(--color-icon, currentColor)",
		},
	},
	iconoir: {
		url: `https://unpkg.com/iconoir@7.11.0/icons/regular/${ICON_NAME_TOKEN}.svg`,
		size: [24, 24],
		style: {
			fill: "none",
			stroke: "var(--color-icon, currentColor)",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	iconoirsolid: {
		url: `https://unpkg.com/iconoir@7.11.0/icons/solid/${ICON_NAME_TOKEN}.svg`,
		size: [24, 24],
		style: {
			fill: "none",
			stroke: "var(--color-icon, currentColor)",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	evaoutline: {
		url: `https://unpkg.com/eva-icons@1.1.3/outline/svg/${ICON_NAME_TOKEN}.svg`,
		style: { stroke: "transparent", fill: "var(--color-icon, currentColor)" },
	},
	evafill: {
		url: `https://unpkg.com/eva-icons@1.1.3/fill/svg/${ICON_NAME_TOKEN}.svg`,
		style: { stroke: "transparent", fill: "var(--color-icon, currentColor)" },
	},
	fluent: {
		url: `https://unpkg.com/@fluentui/svg-icons@1.1.315/icons/${ICON_NAME_TOKEN}.svg`,
		transform: (name) => name.replaceAll("-", "_"),
	},
	lucide: {
		url: `https://unpkg.com/lucide-static@0.577.0/icons/${ICON_NAME_TOKEN}.svg`,
		size: [24, 24],
		style: {
			fill: "none",
			stroke: "var(--color-icon, currentColor)",
			"stroke-width": "2px",
			"vector-effect": "non-scaling-stroke",
		},
	},
};

// ----------------------------------------------------------------------------
// SECTION: Storage
// ----------------------------------------------------------------------------

/**
 * Hidden SVG container that holds all loaded icon symbols.
 *
 * @type {SVGSVGElement}
 */
const IconsContainer = Object.entries({
	width: "0",
	height: "0",
	viewBox: "0 0 0 0",
	style: "position:absolute; width:0; height:0; overflow:hidden;",
}).reduce((r, [k, v]) => {
	r.setAttribute(k, v);
	return r;
}, document.createElementNS(SVG_NAMESPACE, "svg"));

/**
 * Global cache mapping icon URLs to loaded SVG symbols or promises.
 *
 * @type {Map<string, SVGSymbolElement|Promise<SVGSymbolElement|undefined>>}
 */
const Cache = new Map();

// ----------------------------------------------------------------------------
// SECTION: Internal Functions
// ----------------------------------------------------------------------------

/**
 * Resolves `source` to its canonical source key using `sources`.
 *
 * @param {IconSource|string} source - The source to resolve
 * @param {Object.<string, IconSource>} [sources=IconSources] - Available sources
 * @returns {string} The canonical source key
 */
function sourceName(source, sources = IconSources) {
	const key = typeof source === "string" ? source.toLowerCase() : source;
	let result = "generic";
	for (const k in sources) {
		if (key === k) {
			result = k;
			break;
		} else if (key === sources[k]) {
			result = k;
			break;
		} else if (sources[k].url === key) {
			result = k;
			break;
		}
	}
	return result.toLowerCase();
}

/**
 * Resolves `source` to a registered source object, falling back to the default
 * source when a string key is unknown.
 *
 * @param {IconSource|string} source - The source to resolve
 * @returns {IconSource} The resolved source
 */
function resolveSource(source) {
	if (typeof source !== "string") {
		return source;
	}

	const key = source.toLowerCase();
	return IconSources[key] || IconSources[DEFAULT_SOURCE_NAME];
}

/**
 * Fetches an icon from a CDN source and caches it as a symbol.
 *
 * @param {string} name - The icon name
 * @param {IconSource|string} [source=DEFAULT_SOURCE_NAME] - The icon source
 * @param {SVGSVGElement} [container=IconsContainer] - Container for caching
 * @param {Map<string, SVGSymbolElement|Promise<SVGSymbolElement|undefined>>} [cache=Cache] - Cache
 * @returns {Promise<SVGSymbolElement|undefined>} The loaded symbol
 */
function loadIcon(
	name,
	source = DEFAULT_SOURCE_NAME,
	container = IconsContainer,
	cache = Cache,
) {
	const resolvedSource = resolveSource(source);

	const sourceId = sourceName(source);
	const iconId = `icon-${name}-${sourceId}`;
	const iconName = resolvedSource.transform
		? resolvedSource.transform(name)
		: name;
	const url = resolvedSource.url.replace(ICON_NAME_TOKEN, iconName);

	const cached = cache.get(url);
	if (cached instanceof Promise) {
		return cached;
	} else if (cached) {
		return Promise.resolve(cached);
	}

	const symbol = document.createElementNS(
		SVG_NAMESPACE,
		"symbol",
	);
	symbol.id = iconId;
	container.appendChild(symbol);

	const res = fetch(url)
		.then((response) => response.text())
		.then((text) => {
			// Strip XML prolog and comments, find SVG start
			const svgStart = Math.max(0, text.indexOf("<svg"));
			symbol.innerHTML = text.substring(svgStart);
			const icon = symbol.firstChild;

			if (icon?.attributes) {
				// Remove conflicting attributes to allow CSS styling
				["stroke-width", "fill", "stroke"].forEach((attr) => {
					if (icon.hasAttribute(attr)) {
						icon.removeAttribute(attr);
					}
				});
			} else {
				console.error(`Icon "${name}" should have content, got:`, text);
			}

			// Apply source-specific styling
			if (resolvedSource) {
				Object.entries(resolvedSource.style).forEach(([k, v]) => {
					icon?.setAttribute(k, `${v}`);
				});
			}

			// Ensure container is in document
			if (!container.parentElement) {
				document.body.appendChild(container);
			}

			cache.set(url, symbol);
			return symbol;
		})
		.catch((reason) => {
			console.warn(
				"icons",
				`Could not load icon "${name}" from <${url}>: ${reason}`,
				symbol,
			);
			return undefined;
		});

	cache.set(url, res);
	return res;
}

// ----------------------------------------------------------------------------
// SECTION: Public API
// ----------------------------------------------------------------------------

/**
 * Creates an SVG element referencing a loaded icon.
 *
 * @param {string} name - The icon name
 * @param {IconOptions} [options={}] - Options for creating the icon
 * @returns {SVGSVGElement} The created SVG element
 */
function icon(name, options = {}) {
	const {
		size = "1em",
		className = "icon",
		source = DEFAULT_SOURCE_NAME,
		container = IconsContainer,
		mode = undefined,
		style: customStyle = {},
	} = options;

	const resolvedSource = resolveSource(source);
	const mergedStyle = Object.assign({}, resolvedSource?.style, customStyle);

	const node = Object.entries({
		width: size,
		height: size,
	}).reduce((r, [k, v]) => {
		r.setAttribute(k, v);
		return r;
	}, document.createElementNS(SVG_NAMESPACE, "svg"));

	const iconPromise = loadIcon(name, source, container).then((symbol) => {
		if (!symbol) {
			console.warn("icons", "Icon missing from source", { name, source });
		} else {
			// Copy viewBox from symbol's first child
			const iconSvg = symbol.firstChild;
			if (iconSvg?.getAttribute) {
				const viewBox = iconSvg.getAttribute("viewBox");
				if (viewBox) {
					node.setAttribute("viewBox", viewBox);
				}
			} else {
				console.warn("icons", `Could not load icon "${name}", got:`, symbol);
			}
		}
		return symbol;
	});

	switch (mode) {
		case "inline":
			Object.assign(node.style, mergedStyle);
			node.classList.add(className);
			node.classList.add("loading");
			iconPromise.then((symbol) => {
				if (!symbol) return;
				const svg = symbol.children[0];
				if (!svg) return;

				// Copy attributes
				for (const attr of Array.from(svg.attributes)) {
					if (!node.hasAttribute(attr.name)) {
						node.setAttribute(attr.name, attr.value);
					}
				}

				// Copy children
				for (const child of Array.from(svg.children)) {
					node.appendChild(child.cloneNode(true));
				}

				node.classList.remove("loading");
			});
			return node;
		default: {
			const use = document.createElementNS(
				SVG_NAMESPACE,
				"use",
			);
			use.classList.add(className);
			Object.assign(node.style, mergedStyle);
			use.setAttribute("href", `#icon-${name}-${sourceName(source)}`);
			node.appendChild(use);
			return node;
		}
	}
}

/**
 * Batch loading placeholder (not implemented).
 *
 * @param {Array<{name: string, source?: IconSource|string}>} icons - Icons to load
 */
function loadIcons(icons) {
	console.warn("loadIcons not implemented", { icons });
}

// ----------------------------------------------------------------------------
// SECTION: Web Components
// ----------------------------------------------------------------------------

/**
 * Registers a <ui-icon> web component using native custom elements.
 * The web component supports `name`, `source`, `size`, and `icon`
 * attributes. Numeric `size` values are converted to pixel units.
 *
 * @param {string} [name="ui-icon"] - The custom element name
 * @param {InstallOptions} [options={}] - Installation options
 */
function install(name = "ui-icon", options = {}) {
	const {
		source = DEFAULT_SOURCE_NAME,
		size = "1em",
		className = "icon",
	} = options;

	// Define the custom element class inline
	class IconElement extends HTMLElement {
		static observedAttributes = ["name", "source", "size", "icon"];
		iconNode = null;

		constructor() {
			super();
			this.attachShadow({ mode: "open" });
		}

		connectedCallback() {
			this.render();
		}

		attributeChangedCallback(name, oldValue, newValue) {
			if (newValue !== null) {
				this.render();
			}
		}

		render() {
			// Check for explicit source/name attributes first
			let iconName = this.getAttribute("name");
			let sourceName = this.getAttribute("source")?.toLowerCase();

			// If no explicit name/source, try parsing the "icon" attribute
			if (!iconName && !sourceName) {
				const iconAttr = this.getAttribute("icon");
				if (iconAttr) {
					// Parse "source:name" format
					const colonIndex = iconAttr.indexOf(":");
					if (colonIndex > 0) {
						sourceName = iconAttr.substring(0, colonIndex).toLowerCase();
						iconName = iconAttr.substring(colonIndex + 1);
					} else {
						// Just a name, no source specified
						iconName = iconAttr;
					}
				}
			}

			// Apply defaults
			iconName = iconName || "star";
			let iconSize = this.getAttribute("size") || size;

			// Convert numeric size (e.g., "12") to pixels (e.g., "12px")
			if (iconSize && /^\d+$/.test(iconSize)) {
				iconSize = `${iconSize}px`;
			}

			const iconSource = sourceName
				? IconSources[sourceName] ||
					(typeof source === "string" ? resolveSource(source) : source)
				: source;

			// Remove old icon if exists
			if (this.iconNode?.parentNode) {
				this.iconNode.parentNode.removeChild(this.iconNode);
			}

			// Create and append new icon
			this.iconNode = icon(iconName, {
				mode: "inline",
				source: iconSource,
				size: iconSize,
				className,
			});

			if (this.shadowRoot) {
				this.shadowRoot.appendChild(this.iconNode);
			}
		}
	}

	// Register the custom element
	if (!customElements.get(name)) {
		customElements.define(name, IconElement);
	}
}

// ----------------------------------------------------------------------------
// SECTION: Exports
// ----------------------------------------------------------------------------

export {
	Cache,
	IconSources,
	IconsContainer,
	icon,
	install,
	loadIcon,
	loadIcons,
};

// EOF
