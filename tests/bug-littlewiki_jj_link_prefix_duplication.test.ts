import { beforeEach, describe, expect, test } from "bun:test";
import { $, Fragment, h } from "../src/js/ui/hyperscript.js";
import { installDom, mountWithHandle } from "./test-utils.ts";

const JJ_URL = "https://martinvonz.github.io/jj/latest/";
const PREFIX = "All docs are at ";
const EXPECTED = `${PREFIX}${JJ_URL}`;

const clone = (value) => JSON.parse(JSON.stringify(value));

const findNode = (root, predicate) => {
	let match;
	root.iterWalk((node) => {
		if (predicate(node)) {
			match = node;
			return false;
		}
		return undefined;
	});
	return match;
};

const directTextNodes = (node) =>
	(node?.childNodes || []).filter((child) => child.nodeType === Node.TEXT_NODE);

const buildDoc = (mode = "other") =>
	mode === "jj-linked"
		? {
				id: 1,
				type: "element",
				name: "content",
				children: [
					{
						id: 2,
						type: "element",
						name: "paragraph",
						children: [
							{ id: 3, type: "text", content: PREFIX, children: [] },
							{
								id: 4,
								type: "element",
								name: "a",
								attributes: { href: JJ_URL },
								children: [
									{ id: 5, type: "text", content: JJ_URL, children: [] },
								],
							},
						],
					},
				],
			}
		: mode === "jj-plain"
			? {
					id: 1,
					type: "element",
					name: "content",
					children: [
						{
							id: 2,
							type: "element",
							name: "paragraph",
							children: [
								{
									id: 3,
									type: "text",
									content: `${PREFIX}${JJ_URL}`,
									children: [],
								},
							],
						},
					],
				}
			: {
					id: 11,
					type: "element",
					name: "content",
					children: [
						{
							id: 12,
							type: "element",
							name: "paragraph",
							children: [
								{
									id: 13,
									type: "text",
									content: "Some other note",
									children: [],
								},
							],
						},
					],
				};

describe("bug littlewiki jj link prefix duplication", () => {
	beforeEach(() => {
		installDom();
	});

	test("note switch to jj linked paragraph does not duplicate text prefix", () => {
		const tree = $.cell(buildDoc("other"));

		function NodeView({ node }) {
			const { type, name, content } = $.get(node);
			const href = node.apply((current) => current?.attributes?.href);
			const children = node
				.apply((current) => current?.children || [])
				.map(
					(child) => h(NodeView, { node: child }),
					(item) => item?.id,
				);
			return type.match((_) =>
				_.case("text", h(Fragment, null, content)).else(
					name.match((_) =>
						_.case("content", h.article(children))
							.case("paragraph", h.p(children))
							.case("a", h.a({ href }, children))
							.else(h.div(children)),
					),
				),
			);
		}

		const App = () => h.div(h(NodeView, { node: tree }));
		const { parent, derivedContext } = mountWithHandle(App, {});

		const jj = buildDoc("jj-linked");
		tree.set(jj, true, derivedContext);
		// second equivalent update mirrors note switching/render churn in app flow
		tree.set(clone(jj), true, derivedContext);

		const link = findNode(
			parent,
			(node) =>
				node.nodeName?.toLowerCase?.() === "a" && node.textContent === JJ_URL,
		);
		expect(link).toBeDefined();

		const paragraph =
			link?.parentNode?.nodeName?.toLowerCase?.() === "p"
				? link.parentNode
				: findNode(
						parent,
						(node) =>
							node.nodeName?.toLowerCase?.() === "p" &&
							node.textContent?.includes(PREFIX),
					);
		expect(paragraph).toBeDefined();
		expect(paragraph.textContent).toBe(EXPECTED);

		const linkInParagraph = findNode(
			paragraph,
			(node) => node.nodeName?.toLowerCase?.() === "a",
		);
		expect(linkInParagraph).toBeDefined();
		expect(linkInParagraph.textContent).toBe(JJ_URL);

		const texts = directTextNodes(paragraph)
			.map((_) => _.data)
			.filter((_) => _.trim().length > 0);
		expect(texts).toEqual([PREFIX]);
	});

	test("plain->linked jj transition keeps exactly one prefix text node", () => {
		const tree = $.cell(buildDoc("jj-plain"));

		function NodeView({ node }) {
			const { type, name, content } = $.get(node);
			const href = node.apply((current) => current?.attributes?.href);
			const children = node
				.apply((current) => current?.children || [])
				.map(
					(child) => h(NodeView, { node: child }),
					(item) => item?.id,
				);
			return type.match((_) =>
				_.case("text", h(Fragment, null, content)).else(
					name.match((_) =>
						_.case("content", h.article(children))
							.case("paragraph", h.p(children))
							.case("a", h.a({ href }, children))
							.else(h.div(children)),
					),
				),
			);
		}

		const App = () => h.div(h(NodeView, { node: tree }));
		const { parent, derivedContext } = mountWithHandle(App, {});

		const jj = buildDoc("jj-linked");
		tree.set(jj, true, derivedContext);
		tree.set(clone(jj), true, derivedContext);

		const paragraph = findNode(
			parent,
			(node) =>
				node.nodeName?.toLowerCase?.() === "p" &&
				node.textContent?.includes(JJ_URL),
		);
		expect(paragraph).toBeDefined();
		expect(paragraph.textContent).toBe(EXPECTED);

		const link = findNode(
			paragraph,
			(node) => node.nodeName?.toLowerCase?.() === "a",
		);
		expect(link).toBeDefined();
		expect(link.textContent).toBe(JJ_URL);

		const texts = directTextNodes(paragraph)
			.map((_) => _.data)
			.filter((_) => _.trim().length > 0);
		expect(texts).toEqual([PREFIX]);
	});

	test("position-keyed source switch does not duplicate prefix before jj link", async () => {
		const flush = async () => {
			await new Promise((resolve) => queueMicrotask(resolve));
			await new Promise((resolve) => setTimeout(resolve, 0));
		};

		const parse = (value) => {
			if (value === "prefix-only") {
				return {
					type: "element",
					name: "content",
					position: { start: 0, end: 80 },
					children: [
						{
							type: "element",
							name: "paragraph",
							position: { start: 12, end: 70 },
							children: [
								{
									type: "text",
									position: { start: 1, end: 16 },
									content: PREFIX,
									children: [],
								},
							],
						},
					],
				};
			}
			return {
				type: "element",
				name: "content",
				position: { start: 0, end: 80 },
				children: [
					{
						type: "element",
						name: "paragraph",
						position: { start: 12, end: 70 },
						children: [
							{
								type: "text",
								position: { start: 12, end: 27 },
								content: PREFIX,
								children: [],
							},
							{
								type: "element",
								name: "a",
								position: { start: 28, end: 69 },
								attributes: { href: JJ_URL },
								children: [
									{
										type: "text",
										position: { start: 28, end: 69 },
										content: JJ_URL,
										children: [],
									},
								],
							},
						],
					},
				],
			};
		};

		const source = $.signal("prefix-only");
		const tree = $.cell(source, (text) => parse(text));

		const keyFor = (item, index) =>
			item?.id ??
			`${item?.position?.start ?? "?"}-${item?.position?.end ?? "?"}:${index}`;

		function NodeView({ node }) {
			const { type, name, content } = $.get(node);
			const href = node.apply((current) => current?.attributes?.href);
			const pos = node.apply((current) =>
				current?.position
					? `${current.position.start}-${current.position.end}`
					: "",
			);
			const children = node
				.apply((current) => current?.children || [])
				.map((child) => h(NodeView, { node: child }), keyFor);
			return type.match((_) =>
				_.case("text", h(Fragment, null, content)).else(
					name.match((_) =>
						_.case("content", h.article(children))
							.case(
								"paragraph",
								h.p({ class: "TextoBlock", "data-pos": pos }, children),
							)
							.case("a", h.a({ href, "data-pos": pos }, children))
							.else(h.div(children)),
					),
				),
			);
		}

		const App = () => h.div(h(NodeView, { node: tree }));
		const { parent, derivedContext } = mountWithHandle(App, {});

		source.set("jj", true, derivedContext);
		await flush();

		const paragraph = findNode(
			parent,
			(node) =>
				node.nodeName?.toLowerCase?.() === "p" &&
				node.getAttribute?.("data-pos") === "12-70",
		);
		expect(paragraph).toBeDefined();
		expect(paragraph.textContent).toBe(EXPECTED);

		const texts = directTextNodes(paragraph)
			.map((_) => _.data)
			.filter((_) => _.trim().length > 0);
		expect(texts).toEqual([PREFIX]);
	});
});
