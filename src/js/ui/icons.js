// SEE: https://observablehq.com/@sebastien/icons
//
export const Icons = Object.entries({
	width: "0",
	height: "0",
	viewBox: "0 0 0 0",
}).reduce((r, [k, v]) => {
	r.setAttribute(k, v);
	return r;
}, document.createElementNS("http://www.w3.org/2000/svg", "svg"));

export const Sources = {
	Iconoir: {
		url: "https://unpkg.com/iconoir@7.0.2/icons/regular/${name}.svg",
		style: {
			fill: "none",
			stroke: "current-color",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	Devicons: {
		url: "https://unpkg.com/devicons@1.8.0/!SVG/${name}.svg",
		style: {
			stroke: "transparent",
			fill: "var(--color-text)",
		},
	},
	IconoirSolid: {
		url: "https://unpkg.com/iconoir@7.0.2/icons/solid/${name}.svg",
		style: {
			fill: "none",
			stroke: "current-color",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	EvaOutline: {
		url: "https://unpkg.com/eva-icons@1.1.3/outline/svg/${name}.svg",
		style: { stroke: "transparent", fill: "var(--color-text)" },
	},
	EvaFill: {
		url: "https://unpkg.com/eva-icons@1.1.3/fill/svg/${name}.svg",
		style: { stroke: "transparent", fill: "var(--color-text)" },
	},
};

const sourceName = (source, sources = Sources) => {
	let sourceName = "generic";
	for (const k in sources) {
		if (source == k) {
			sourceName = k;
			break;
		} else if (source === sources[k]) {
			sourceName = k;
			break;
		} else if (sources[k].url == source) {
			sourceName = k;
			break;
		}
	}
	return sourceName.toLowerCase();
};

export const loadIcon = (name, source = Sources.Iconoir, container = Icons) => {
	const iconId = `icon-${name}-${sourceName(source)}`;
	const existing = container.getElementById(iconId);
	if (typeof source === "string") {
		source = Sources[source] || Sources.Iconoir;
	}
	const url = (source?.url || source).replace("${name}", name);
	if (existing) {
		Promise.resolve(existing);
	} else {
		const symbol = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"symbol"
		);
		symbol.id = iconId;
		container.appendChild(symbol);
		return fetch(url)
			.then((_) => _.text())
			.then((text) => {
				symbol.innerHTML = text;
				const icon = symbol.firstChild;
				if (icon && icon.attributes) {
					["stroke-width", "fill", "stroke"].forEach(
						(_) => icon.hasAttribute(_) && icon.setAttribute(_, "")
					);
				} else {
					console.error(
						`Icon "${name}" should have a content, got:`,
						text
					);
				}
				Object.entries(source.style).forEach(([k, v]) =>
					icon.setAttribute(k, `${v}`)
				);
				if (!container.parentElement) {
					document.body.appendChild(container);
				}
				return symbol;
			})
			.catch((reason) => {
				console.error(
					`Could not load icon ${name} from ${url}: ${reason}`
				);
			});
	}
};

export const icon = (name, options) => {
	const size = options?.size || "1.30em";
	const className = options?.className || "icon";
	const source = options?.source || Sources.Iconoir;
	const style = Object.assign({}, source?.style, options?.style);
	const container = options?.container || Icons;
	const node = Object.entries({ width: size, height: size }).reduce(
		(r, [k, v]) => {
			r.setAttribute(k, v);
			return r;
		},
		document.createElementNS("http://www.w3.org/2000/svg", "svg")
	);
	loadIcon(name, source, container).then((symbol) => {
		["viewBox"].forEach((_) => {
			const icon = symbol.firstChild;
			if (icon && icon.getAttribute) {
				node.setAttribute(_, icon.getAttribute(_));
			} else {
				console.error(`Could not load icon "${name}", got:`, symbol);
			}
		});
	});
	const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
	use.classList.add(className);
	Object.assign(node.style, style);
	use.setAttribute("href", `#icon-${name}-${sourceName(source)}`);
	node.appendChild(use);
	return node;
};

// EOF
