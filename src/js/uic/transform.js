import { walk } from "estree-walker";

const toLiteral = (value) => ({
	type: "Literal",
	value,
});

const identifier = (name) => ({
	type: "Identifier",
	name,
});

const call = (callee, args = []) => ({
	type: "CallExpression",
	callee,
	arguments: args,
	optional: false,
});

const isIdentifierName = (value) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const objectProperty = (key, value) => ({
	type: "Property",
	key: isIdentifierName(key) ? identifier(key) : toLiteral(key),
	value,
	kind: "init",
	method: false,
	shorthand: false,
	computed: !isIdentifierName(key),
});

const objectExpression = (properties) => ({
	type: "ObjectExpression",
	properties,
});

const jsxName = (name) => {
	if (!name) {
		return "";
	}
	if (name.type === "JSXIdentifier") {
		return name.name;
	}
	if (name.type === "JSXNamespacedName") {
		return `${name.namespace.name}:${name.name.name}`;
	}
	if (name.type === "JSXMemberExpression") {
		return `${jsxName(name.object)}.${jsxName(name.property)}`;
	}
	return "";
};

const jsxNameExpression = (name) => {
	if (!name) {
		return identifier("");
	}
	if (name.type === "JSXIdentifier") {
		return identifier(name.name);
	}
	if (name.type === "JSXMemberExpression") {
		return {
			type: "MemberExpression",
			object: jsxNameExpression(name.object),
			property: identifier(name.property.name),
			computed: false,
			optional: false,
		};
	}
	return identifier(jsxName(name));
};

const escapeText = (value) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (value) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const normalizeAttributeName = (name) => {
	if (name === "className") {
		return "class";
	}
	if (name === "htmlFor") {
		return "for";
	}
	return name;
};

const hasSpread = (node) =>
	node.openingElement.attributes.some((_) => _.type === "JSXSpreadAttribute");

const isDynamicTag = (node) => {
	const name = node.openingElement.name;
	if (name.type === "JSXIdentifier") {
		return /[A-Z]/.test(name.name[0]);
	}
	return true;
};

const buildHCallFromJSX = (node) => {
	if (node.type === "JSXFragment") {
		const children = [];
		for (const child of node.children || []) {
			if (child.type === "JSXText") {
				const text = child.value.replace(/\s+/g, " ").trim();
				if (text) {
					children.push(toLiteral(text));
				}
			} else if (child.type === "JSXExpressionContainer") {
				if (child.expression.type !== "JSXEmptyExpression") {
					children.push(child.expression);
				}
			} else if (child.type === "JSXElement" || child.type === "JSXFragment") {
				children.push(buildHCallFromJSX(child));
			}
		}
		return call(identifier("h"), [toLiteral(""), toLiteral(null), ...children]);
	}

	const tag = node.openingElement.name;
	const tagExpression =
		tag.type === "JSXIdentifier"
			? /[A-Z]/.test(tag.name[0])
				? identifier(tag.name)
				: toLiteral(tag.name)
			: jsxNameExpression(tag);

	const props = [];
	for (const attr of node.openingElement.attributes) {
		if (attr.type === "JSXSpreadAttribute") {
			props.push({
				type: "SpreadElement",
				argument: attr.argument,
			});
			continue;
		}
		const name = normalizeAttributeName(jsxName(attr.name));
		let value = toLiteral(true);
		if (attr.value?.type === "Literal") {
			value = attr.value;
		} else if (attr.value?.type === "JSXExpressionContainer") {
			value = attr.value.expression;
		}
		props.push(objectProperty(name, value));
	}

	const children = [];
	for (const child of node.children || []) {
		if (child.type === "JSXText") {
			const text = child.value.replace(/\s+/g, " ").trim();
			if (text) {
				children.push(toLiteral(text));
			}
		} else if (child.type === "JSXExpressionContainer") {
			if (child.expression.type !== "JSXEmptyExpression") {
				children.push(child.expression);
			}
		} else if (child.type === "JSXElement" || child.type === "JSXFragment") {
			children.push(buildHCallFromJSX(child));
		}
	}

	return call(identifier("h"), [
		tagExpression,
		props.length ? objectExpression(props) : toLiteral(null),
		...children,
	]);
};

const compileElement = (node, state) => {
	const markerIndex = state.nextMarker++;
	const htmlParts = [];
	const bindings = [];
	let nodeCounter = 0;
	const nextMarker = () => `uic:t${state.nextMarker++}`;

	const visit = (element) => {
		const name = jsxName(element.openingElement.name);
		htmlParts.push(`<${name}`);
		const nodeKey = `uic:n${markerIndex}_${nodeCounter++}`;
		htmlParts.push(` data-uic-node="${nodeKey}"`);

		for (const attr of element.openingElement.attributes) {
			if (attr.type === "JSXSpreadAttribute") {
				return false;
			}
			const attrName = normalizeAttributeName(jsxName(attr.name));
			if (!attr.value) {
				htmlParts.push(` ${attrName}`);
				continue;
			}
			if (attr.value.type === "Literal") {
				htmlParts.push(` ${attrName}="${escapeAttr(`${attr.value.value}`)}"`);
				continue;
			}
			if (attr.value.type === "JSXExpressionContainer") {
				const expr = attr.value.expression;
				if (expr.type === "Literal") {
					htmlParts.push(` ${attrName}="${escapeAttr(`${expr.value}`)}"`);
				} else {
					bindings.push(
						attrName.startsWith("on")
							? {
									kind: "event",
									event: attrName,
									node: nodeKey,
									get: expr,
								}
							: {
									kind: "attr",
									name: attrName,
									node: nodeKey,
									get: expr,
								},
					);
				}
			}
		}

		if (element.openingElement.selfClosing) {
			htmlParts.push(" />");
			return true;
		}

		htmlParts.push(">");
		for (const child of element.children || []) {
			if (child.type === "JSXText") {
				const text = child.value.replace(/\s+/g, " ");
				if (text.trim()) {
					htmlParts.push(escapeText(text));
				}
			} else if (child.type === "JSXExpressionContainer") {
				if (child.expression.type === "JSXEmptyExpression") {
					continue;
				}
				const marker = nextMarker();
				htmlParts.push(`<!--${marker}-->`);
				bindings.push({
					kind: "text",
					marker,
					get: child.expression,
				});
			} else if (child.type === "JSXElement") {
				if (isDynamicTag(child) || hasSpread(child)) {
					return false;
				}
				if (!visit(child)) {
					return false;
				}
			} else {
				return false;
			}
		}
		htmlParts.push(`</${name}>`);
		return true;
	};

	if (!visit(node)) {
		return null;
	}

	return {
		html: htmlParts.join(""),
		bindings,
	};
};

const buildCompiledCallWithTemplate = (
	templateIdentifierName,
	bindingIdentifierName,
	compiledResult,
) =>
	call(identifier("compiled"), [
		identifier(templateIdentifierName),
		identifier(bindingIdentifierName),
		...compiledResult.bindings.map((binding) => binding.get),
	]);

const buildBindingMetadataArray = (compiledResult) => ({
	type: "ArrayExpression",
	elements: compiledResult.bindings.map((binding) => {
		const props = [objectProperty("kind", toLiteral(binding.kind))];
		if (binding.name) {
			props.push(objectProperty("name", toLiteral(binding.name)));
		}
		if (binding.event) {
			props.push(objectProperty("event", toLiteral(binding.event)));
		}
		if (binding.marker) {
			props.push(objectProperty("marker", toLiteral(binding.marker)));
		}
		if (binding.node) {
			props.push(objectProperty("node", toLiteral(binding.node)));
		}
		return objectExpression(props);
	}),
});

const makeHoistedBindingName = (templateName) => `${templateName}_b`;

const collectTopLevelNames = (ast) => {
	const names = new Set();
	for (let i = 0; i < ast.body.length; i++) {
		const node = ast.body[i];
		if (node.type === "ImportDeclaration") {
			for (let j = 0; j < node.specifiers.length; j++) {
				names.add(node.specifiers[j].local.name);
			}
		} else if (node.type === "VariableDeclaration") {
			for (let j = 0; j < node.declarations.length; j++) {
				const id = node.declarations[j].id;
				if (id?.type === "Identifier") {
					names.add(id.name);
				}
			}
		} else if (
			node.type === "FunctionDeclaration" ||
			node.type === "ClassDeclaration"
		) {
			if (node.id?.name) {
				names.add(node.id.name);
			}
		}
	}
	return names;
};

const makeHoistedName = (state) => {
	let n = state.nextHoisted + 1;
	let name = `_uic${n}`;
	while (state.takenNames.has(name)) {
		n += 1;
		name = `_uic${n}`;
	}
	state.nextHoisted = n;
	state.takenNames.add(name);
	return name;
};

const hoistCompiledTemplates = (ast, state) => {
	if (!state.hoisted.length) {
		return;
	}
	const declarations = state.hoisted.flatMap((entry) => {
		const bindingsName = makeHoistedBindingName(entry.name);
		return [
			{
				type: "VariableDeclaration",
				kind: "const",
				declarations: [
					{
						type: "VariableDeclarator",
						id: identifier(entry.name),
						init: toLiteral(entry.compiledResult.html),
					},
				],
			},
			{
				type: "VariableDeclaration",
				kind: "const",
				declarations: [
					{
						type: "VariableDeclarator",
						id: identifier(bindingsName),
						init: buildBindingMetadataArray(entry.compiledResult),
					},
				],
			},
		];
	});
	const insertAt = ast.body.findIndex((_) => _.type !== "ImportDeclaration");
	ast.body.splice(
		insertAt === -1 ? ast.body.length : insertAt,
		0,
		...declarations,
	);
};

const addImports = (ast, state) => {
	let lastImport = -1;
	let hasCompilerImport = false;
	let hasHImport = false;

	for (let i = 0; i < ast.body.length; i++) {
		const entry = ast.body[i];
		if (entry.type !== "ImportDeclaration") {
			continue;
		}
		lastImport = i;
		if (
			entry.source.value === "ui/uic/runtime" ||
			entry.source.value === "ui/compiler" ||
			entry.source.value.endsWith("/ui/compiler.js")
		) {
			hasCompilerImport = entry.specifiers.some(
				(_) => _.type === "ImportSpecifier" && _.imported.name === "compiled",
			);
		}
		if (
			entry.source.value === "ui" ||
			entry.source.value.endsWith("/ui/hyperscript.js") ||
			entry.source.value.endsWith("/ui.js")
		) {
			hasHImport = entry.specifiers.some(
				(_) => _.type === "ImportSpecifier" && _.imported.name === "h",
			);
		}
	}

	if (state.usesCompiled && !hasCompilerImport) {
		const importNode = {
			type: "ImportDeclaration",
			specifiers: [
				{
					type: "ImportSpecifier",
					imported: identifier("compiled"),
					local: identifier("compiled"),
				},
			],
			source: toLiteral("ui/uic/runtime"),
		};
		ast.body.splice(lastImport + 1, 0, importNode);
		lastImport += 1;
	}

	if (state.usesFallbackH && !hasHImport) {
		const importNode = {
			type: "ImportDeclaration",
			specifiers: [
				{
					type: "ImportSpecifier",
					imported: identifier("h"),
					local: identifier("h"),
				},
			],
			source: toLiteral("ui"),
		};
		ast.body.splice(lastImport + 1, 0, importNode);
	}
};

export const transform = (ast) => {
	const state = {
		nextMarker: 0,
		nextHoisted: 0,
		usesCompiled: false,
		usesFallbackH: false,
		hoisted: [],
		takenNames: collectTopLevelNames(ast),
	};

	walk(ast, {
		enter(node, parent, key, index) {
			if (node.type !== "JSXElement" && node.type !== "JSXFragment") {
				return;
			}
			if (node.type === "JSXFragment") {
				state.usesFallbackH = true;
				const fallback = buildHCallFromJSX(node);
				if (Array.isArray(parent[key])) {
					parent[key][index] = fallback;
				} else {
					parent[key] = fallback;
				}
				this.skip();
				return;
			}
			if (isDynamicTag(node) || hasSpread(node)) {
				state.usesFallbackH = true;
				const fallback = buildHCallFromJSX(node);
				if (Array.isArray(parent[key])) {
					parent[key][index] = fallback;
				} else {
					parent[key] = fallback;
				}
				this.skip();
				return;
			}

			const compiledResult = compileElement(node, state);
			if (!compiledResult) {
				state.usesFallbackH = true;
				const fallback = buildHCallFromJSX(node);
				if (Array.isArray(parent[key])) {
					parent[key][index] = fallback;
				} else {
					parent[key] = fallback;
				}
				this.skip();
				return;
			}

			state.usesCompiled = true;
			const hoistedName = makeHoistedName(state);
			state.hoisted.push({ name: hoistedName, compiledResult });
			const bindingHoistedName = makeHoistedBindingName(hoistedName);
			const replacement = buildCompiledCallWithTemplate(
				hoistedName,
				bindingHoistedName,
				compiledResult,
			);
			if (Array.isArray(parent[key])) {
				parent[key][index] = replacement;
			} else {
				parent[key] = replacement;
			}
			this.skip();
		},
	});

	hoistCompiledTemplates(ast, state);
	addImports(ast, state);
	return ast;
};

// EOF
