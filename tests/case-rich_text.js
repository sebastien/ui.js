import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	countDomNodes,
	measure,
	printMetrics,
	settle,
	summarizeRuns,
} from "./case-harness.js";
import { mountCase } from "./case-mount.js";

const Paragraph = ({ node }) =>
	h.p({ "data-role": "paragraph" }, node.apply((value) => value?.text ?? ""));
const Bold = ({ node }) =>
	h.strong({ "data-role": "bold" }, node.apply((value) => value?.text ?? ""));
const Link = ({ node }) =>
	h.a(
		{
			"data-role": "link",
			href: node.apply((value) => value?.href ?? "#"),
			target: "_blank",
		},
		node.apply((value) => value?.text ?? "")
	);
const CodeBlock = ({ node }) =>
	h.pre({ "data-role": "code" }, node.apply((value) => value?.code ?? ""));

const componentForType = {
	paragraph: Paragraph,
	bold: Bold,
	link: Link,
	code: CodeBlock,
};

const buildInitialNodes = (count = 240) => {
	const types = ["paragraph", "bold", "link", "code"];
	const nodes = [];
	for (let i = 0; i < count; i++) {
		const type = types[i % types.length];
		nodes.push({
			id: i + 1,
			type,
			text: `Node ${i + 1}`,
			href: `https://example.com/${i + 1}`,
			code: `const n${i + 1} = ${i + 1};`,
		});
	}
	return nodes;
};

export const createRichTextCase = () => {
	const nodes = $.cell(buildInitialNodes());
	let context;
	let stateNodes = buildInitialNodes();

	const updateNode = (id, patch) => {
		stateNodes = stateNodes.map((node) =>
			node.id === id ? { ...node, ...patch } : node
		);
		nodes.set(stateNodes, true, context);
	};

	const rotateTypes = () => {
		const order = ["paragraph", "bold", "link", "code"];
		stateNodes = stateNodes.map((node) => {
				const current = order.indexOf(node.type);
				return { ...node, type: order[(current + 1) % order.length] };
			});
		nodes.set(stateNodes, true, context);
	};

	const RichNode = ({ node }) => h(node.apply((value) => componentForType[value.type]), { node });

	const App = () =>
		h.article(
			h.h2("Rich Text"),
			h.div({ "data-role": "rich-root" }, nodes.map((node) => h(RichNode, { node })))
		);

	const mount = (root) => {
		const mounted = mountCase(App, root, {});
		context = mounted.derivedContext;
		stateNodes = buildInitialNodes();
		nodes.observable(context);
		nodes.set(stateNodes, true, context);
		return mounted;
	};

	return {
		mount,
		updateNode,
		rotateTypes,
		getNodes: () => stateNodes.slice(),
	};
};

export const runRichTextBenchmark = async ({ root, runs = 8 } = {}) => {
	const allRuns = [];
	for (let runIndex = 0; runIndex < runs; runIndex++) {
		const api = createRichTextCase();
		root.replaceChildren();
		const mountRes = await measure(async () => {
			api.mount(root);
			await settle();
		});
		const domBefore = countDomNodes(root);
		const interaction = await measure(async () => {
			for (let i = 1; i <= 120; i++) {
				api.updateNode(i, {
					text: `Updated ${i}`,
					code: `const updated${i} = ${i * 3};`,
				});
			}
			api.rotateTypes();
			api.rotateTypes();
			await settle();
		});
		allRuns.push({
			mount_time_ms: mountRes.duration,
			interaction_total_ms: interaction.duration,
			dom_nodes_before: domBefore,
			dom_nodes_after: countDomNodes(root),
			node_count: api.getNodes().length,
		});
	}

	const summary = summarizeRuns("rich_text", allRuns, (runsData) => ({
		dom_nodes_before: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_before, 0) / runsData.length
		),
		dom_nodes_after: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_after, 0) / runsData.length
		),
		node_count: runsData.at(-1)?.node_count || 0,
	}));
	printMetrics("rich_text", summary);
	return summary;
};
