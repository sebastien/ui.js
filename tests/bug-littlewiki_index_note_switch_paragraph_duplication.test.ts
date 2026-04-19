import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

/**
 * Reproduces the "index note switch" first-paragraph text duplication.
 *
 * Root cause: texto parser produces sequential integer IDs that overlap between
 * different documents. When switching from `## HELLO\n1) ONE\n2) TWO` to
 * `# Jujutsu\n\nAll docs are at <url>`, the keyed child map reuses slots by
 * id. ID 10 goes from list→p, ID 11 goes from item→text, ID 12 goes from
 * text("ONE")→a(link). The type/name branch switches leave stale DOM nodes.
 *
 * Uses happy-dom for realistic DOM + mountWithHandle for proper context.
 */

const win = new Window() as any;
for (const key of Object.getOwnPropertyNames(win)) {
	if (!(key in globalThis)) {
		try {
			(globalThis as any)[key] = (win as any)[key];
		} catch {}
	}
}
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).requestAnimationFrame =
	(globalThis as any).requestAnimationFrame ||
	((cb: Function) => setTimeout(cb, 0));

const { component } = await import("../src/js/ui/templates.js");
const { DOMEffector } = await import("../src/js/ui/effectors.js");
const { Slot } = await import("../src/js/ui/cells.js");
const { h, $, Fragment } = await import("../src/js/ui/hyperscript.js");

function mountWithHandle(Component: any, data: any) {
	const c = component(Component);
	const effect = c.application(data);
	const effector = new DOMEffector();
	const rootContext = {};
	const ctx = Object.create(rootContext);
	ctx[Slot.Owner] = effect;
	ctx[Slot.Parent] = rootContext;
	ctx[Slot.Name] = "test";
	ctx[Slot.Input] = data;
	const parent = document.createElement("div");
	const node = effect.render(parent, 0, ctx, effector);
	if (node && !node.parentNode) {
		parent.appendChild(node);
	}
	const derivedContext = effect.input.applyContext(ctx);
	return { parent, derivedContext };
}

const JJ_URL = "https://martinvonz.github.io/jj/latest/";
const PREFIX = "All docs are at ";
const EXPECTED = `${PREFIX}${JJ_URL}`;

const flush = async (ms = 0) => {
	await new Promise((resolve) => queueMicrotask(resolve));
	if (ms > 0) {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}
};

const walk = (root: any, predicate: (node: any) => boolean) => {
	const matches: any[] = [];
	const visit = (node: any) => {
		if (predicate(node)) {
			matches.push(node);
		}
		for (const child of node.childNodes || []) {
			visit(child);
		}
	};
	visit(root);
	return matches;
};

const directTextNodes = (node: any) =>
	Array.from(node?.childNodes || []).filter(
		(child: any) => child.nodeType === Node.TEXT_NODE,
	);

const attrs = (entries?: Record<string, string>) =>
	new Map(Object.entries(entries ?? {}));

/**
 * Trees mirror EXACT texto parser output for the two documents.
 * IDs overlap (both start from 2), which causes keyed slot reuse.
 *
 * Initial: `## HELLO\n\n1) ONE\n2) TWO\n3) THREE`
 *   content(2) → section(6) → [title(7) → text(8,"HELLO"),
 *                                content(9) → list(10) → [item(11)→text(12,"ONE"),
 *                                                          item(13)→text(14,"TWO"),
 *                                                          item(15)→text(16,"THREE")]]
 *
 * JJ: `# Jujutsu\n\n\nAll docs are at <url>`
 *   content(2) → section(6) → [title(7) → text(8,"Jujutsu"),
 *                                content(9) → p(10) → [text(11,"All docs are at "),
 *                                                        a(12) → text(13,url)]]
 *
 * Critical overlaps: 10: list→p, 11: item→text, 12: text→a
 */
const parse = (source: string) => {
	if (source === "initial") {
		return {
			id: 2,
			type: "element",
			name: "content",
			attributes: attrs({ block: "container", level: "0" }),
			position: { start: 0, end: 32 },
			children: [
				{
					id: 6,
					type: "element",
					name: "section",
					attributes: attrs({ block: "container", level: "1" }),
					position: { start: 0, end: 9 },
					children: [
						{
							id: 7,
							type: "element",
							name: "title",
							attributes: attrs({ block: "block", level: "2" }),
							position: { start: 3, end: 8 },
							children: [
								{
									id: 8,
									type: "text",
									content: "HELLO",
									attributes: attrs(),
									children: [],
									position: { start: 3, end: 8 },
								},
							],
						},
						{
							id: 9,
							type: "element",
							name: "content",
							attributes: attrs({
								block: "container",
								level: "2",
							}),
							position: { start: 9, end: 9 },
							children: [
								{
									id: 10,
									type: "element",
									name: "list",
									attributes: attrs({
										block: "block",
										level: "3",
									}),
									position: { start: 10, end: 32 },
									children: [
										{
											id: 11,
											type: "element",
											name: "item",
											attributes: attrs(),
											position: { start: 10, end: 16 },
											children: [
												{
													id: 12,
													type: "text",
													content: "ONE",
													attributes: attrs(),
													children: [],
													position: {
														start: 13,
														end: 16,
													},
												},
											],
										},
										{
											id: 13,
											type: "element",
											name: "item",
											attributes: attrs(),
											position: { start: 17, end: 23 },
											children: [
												{
													id: 14,
													type: "text",
													content: "TWO",
													attributes: attrs(),
													children: [],
													position: {
														start: 20,
														end: 23,
													},
												},
											],
										},
										{
											id: 15,
											type: "element",
											name: "item",
											attributes: attrs(),
											position: { start: 24, end: 32 },
											children: [
												{
													id: 16,
													type: "text",
													content: "THREE",
													attributes: attrs(),
													children: [],
													position: {
														start: 27,
														end: 32,
													},
												},
											],
										},
									],
								},
							],
						},
					],
				},
			],
		};
	}
	return {
		id: 2,
		type: "element",
		name: "content",
		attributes: attrs({ block: "container", level: "0" }),
		position: { start: 0, end: 69 },
		children: [
			{
				id: 6,
				type: "element",
				name: "section",
				attributes: attrs({ block: "container", level: "1" }),
				position: { start: 0, end: 9 },
				children: [
					{
						id: 7,
						type: "element",
						name: "title",
						attributes: attrs({ block: "block", level: "2" }),
						position: { start: 2, end: 9 },
						children: [
							{
								id: 8,
								type: "text",
								content: "Jujutsu",
								attributes: attrs(),
								children: [],
								position: { start: 2, end: 9 },
							},
						],
					},
					{
						id: 9,
						type: "element",
						name: "content",
						attributes: attrs({
							block: "container",
							level: "2",
						}),
						position: { start: 9, end: 9 },
						children: [
							{
								id: 10,
								type: "element",
								name: "p",
								attributes: attrs({
									block: "block",
									level: "3",
								}),
								position: { start: 12, end: 69 },
								children: [
									{
										id: 11,
										type: "text",
										content: PREFIX,
										attributes: attrs(),
										children: [],
										position: { start: 12, end: 28 },
									},
									{
										id: 12,
										type: "element",
										name: "a",
										attributes: attrs({ href: JJ_URL }),
										position: { start: 28, end: 69 },
										children: [
											{
												id: 13,
												type: "text",
												content: JJ_URL,
												attributes: attrs(),
												children: [],
												position: {
													start: 29,
													end: 68,
												},
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	};
};

const keyFor = (item: any, _index: number) =>
	item?.id ??
	`${item?.position?.start ?? "?"}-${item?.position?.end ?? "?"}:${_index}`;

function NodeView({ node }: { node: any }) {
	const isEdited = $.cell(false);
	const { name, type, content, attributes } = $.get(node);
	const blockType = attributes.apply((_: any) => _?.get?.("block"));
	const href = attributes.apply((_: any) =>
		_ instanceof Map ? _.get("href") : _?.href,
	);
	const pos = node.apply((current: any) =>
		current?.position
			? `${current.position.start}-${current.position.end}`
			: "",
	);
	const children = node
		.apply((current: any) => current?.children || [])
		.map((child: any) => h(NodeView, { node: child }), keyFor);

	const createBlock = (tag: string) =>
		blockType.match((_: any) =>
			_.case(
				"block",
				h[tag]({ class: "TextoBlock", "data-pos": pos }, children),
			).else(h[tag]({ "data-pos": pos }, children)),
		);

	const element = type.match((_: any) =>
		_.case("text", h(Fragment, null, content)).else(
			name.match((_: any) =>
				_.case("content", createBlock("article"))
					.case("p", createBlock("p"))
					.case("paragraph", createBlock("p"))
					.case("section", h.section({ "data-pos": pos }, children))
					.case("title", createBlock("h1"))
					.case("list", createBlock("ul"))
					.case("item", h.li({ "data-pos": pos }, children))
					.case("a", h.a({ href, "data-pos": pos }, children))
					.else(h.div(children)),
			),
		),
	);

	return isEdited.match((_: any) =>
		_.case(true, h.div("editor")).else(element),
	);
}

describe("bug littlewiki index note switch paragraph duplication (happy-dom)", () => {
	test("switching source signal should not duplicate leading paragraph text", async () => {
		const source = $.signal("initial");
		const root = $.cell(source, (text: string) => parse(text));

		function App() {
			return h.div(
				root.match((_: any) =>
					_.case(null, h.div("Error")).else(h(NodeView, { node: root })),
				),
			);
		}

		const { parent, derivedContext } = mountWithHandle(App, {});
		await flush(20);

		// Switch to jj note
		source.set("jj", true, derivedContext);
		await flush(20);

		const paragraphs = walk(
			parent,
			(node: any) =>
				node.tagName?.toLowerCase?.() === "p" &&
				(node.textContent || "").includes(JJ_URL),
		);
		expect(paragraphs.length).toBeGreaterThanOrEqual(1);
		const paragraph = paragraphs[0];

		// The critical assertion: no duplicated prefix text
		expect(paragraph.textContent).toBe(EXPECTED);

		const links = walk(
			paragraph,
			(node: any) => node.tagName?.toLowerCase?.() === "a",
		);
		expect(links.length).toBe(1);
		expect(links[0].textContent).toBe(JJ_URL);

		const texts = (directTextNodes(paragraph) as any[])
			.map((_: any) => _.data || _.textContent || "")
			.filter((_: string) => _.trim().length > 0);
		expect(texts).toEqual([PREFIX]);
	});

	test("double set of same jj content should not duplicate text", async () => {
		const source = $.signal("initial");
		const root = $.cell(source, (text: string) => parse(text));

		function App() {
			return h.div(
				root.match((_: any) =>
					_.case(null, h.div("Error")).else(h(NodeView, { node: root })),
				),
			);
		}

		const { parent, derivedContext } = mountWithHandle(App, {});
		await flush(20);

		source.set("jj", true, derivedContext);
		await flush(20);

		// Second identical switch (render churn)
		source.set("jj", true, derivedContext);
		await flush(20);

		const paragraphs = walk(
			parent,
			(node: any) =>
				node.tagName?.toLowerCase?.() === "p" &&
				(node.textContent || "").includes(JJ_URL),
		);
		expect(paragraphs.length).toBeGreaterThanOrEqual(1);
		const paragraph = paragraphs[0];
		expect(paragraph.textContent).toBe(EXPECTED);

		const texts = (directTextNodes(paragraph) as any[])
			.map((_: any) => _.data || _.textContent || "")
			.filter((_: string) => _.trim().length > 0);
		expect(texts).toEqual([PREFIX]);
	});
});
