import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	countDomNodes,
	measure,
	printMetrics,
	settle,
	summarizeRuns,
} from "./case-harness.js";
import { mountCase } from "./case-mount.js";

const clamp = (value) => Math.max(0, Math.min(255, value));
const toHex = (value) => clamp(value).toString(16).padStart(2, "0");
const rgbToHex = (value) => {
	const source = value || { r: 0, g: 0, b: 0 };
	return `#${toHex(source.r)}${toHex(source.g)}${toHex(source.b)}`;
};

const parseHex = (hex) => {
	const source = `${hex || ""}`.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(source)) {
		return null;
	}
	return {
		r: Number.parseInt(source.slice(0, 2), 16),
		g: Number.parseInt(source.slice(2, 4), 16),
		b: Number.parseInt(source.slice(4, 6), 16),
	};
};

export const createColorPaletteCase = () => {
	const color = $.cell({ r: 80, g: 120, b: 200 });
	const hex = $.cell("#5078c8");
	let context;
	let stateColor = { r: 80, g: 120, b: 200 };
	let stateHex = "#5078c8";

	const setRgb = (channel, value) => {
		const next = { ...stateColor, [channel]: clamp(value) };
		stateColor = next;
		stateHex = rgbToHex(next);
		color.set(next, true, context);
		hex.set(stateHex, true, context);
	};

	const setHex = (value) => {
		const normalized = value.startsWith("#") ? value : `#${value}`;
		stateHex = normalized;
		hex.set(normalized, true, context);
		const rgb = parseHex(normalized);
		if (rgb) {
			stateColor = rgb;
			color.set(rgb, true, context);
		}
	};

	const presets = ["#ff0000", "#00ff00", "#0000ff", "#ffcc00", "#1f9d92"];

	const Channel = ({ label, channel }) =>
		h.label(
			{ "data-role": `channel-${channel}` },
			`${label}: `,
			h.input({
				type: "range",
				min: "0",
				max: "255",
				value: color.apply((value) => value?.[channel] ?? 0),
				onInput: (event) => setRgb(channel, Number.parseInt(event.target.value, 10)),
			}),
			h.output(color.apply((value) => `${value?.[channel] ?? 0}`))
		);

	const App = () =>
		h.section(
			h.h2("Color Palette"),
			h.div(h(Channel, { label: "R", channel: "r" })),
			h.div(h(Channel, { label: "G", channel: "g" })),
			h.div(h(Channel, { label: "B", channel: "b" })),
			h.label(
				"HEX: ",
				h.input({
					"data-role": "hex-input",
					value: hex,
					onInput: (event) => setHex(event.target.value),
				})
			),
			h.div(
				{ "data-role": "presets" },
				presets.map((preset) =>
					h.button(
						{ onClick: () => setHex(preset), "data-role": `preset-${preset.slice(1)}` },
						preset
					)
				)
			),
			h.div({ "data-role": "swatch", style: color.apply((value) => `background:${rgbToHex(value)}`) }, " ")
		);

	const mount = (root) => {
		const mounted = mountCase(App, root, {});
		context = mounted.derivedContext;
		stateColor = { r: 80, g: 120, b: 200 };
		stateHex = "#5078c8";
		color.observable(context);
		hex.observable(context);
		color.set(stateColor, true, context);
		hex.set(stateHex, true, context);
		return mounted;
	};

	return {
		mount,
		setRgb,
		setHex,
		getRgb: () => ({ ...stateColor }),
		getHex: () => stateHex,
	};
};

export const runColorPaletteBenchmark = async ({ root, runs = 12 } = {}) => {
	const allRuns = [];
	for (let runIndex = 0; runIndex < runs; runIndex++) {
		const api = createColorPaletteCase();
		root.replaceChildren();
		const mountRes = await measure(async () => {
			api.mount(root);
			await settle();
		});
		const domBefore = countDomNodes(root);
		const interaction = await measure(async () => {
			for (let i = 0; i < 200; i++) {
				api.setRgb("r", (i * 13) % 256);
				api.setRgb("g", (i * 7) % 256);
				api.setRgb("b", (i * 29) % 256);
			}
			api.setHex("#12af44");
			api.setHex("#fef08a");
			api.setHex("#223344");
			await settle();
		});
		allRuns.push({
			mount_time_ms: mountRes.duration,
			interaction_total_ms: interaction.duration,
			dom_nodes_before: domBefore,
			dom_nodes_after: countDomNodes(root),
			hex: api.getHex(),
		});
	}

	const summary = summarizeRuns("color_palette", allRuns, (runsData) => ({
		dom_nodes_before: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_before, 0) / runsData.length
		),
		dom_nodes_after: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_after, 0) / runsData.length
		),
		last_hex: runsData.at(-1)?.hex || null,
	}));
	printMetrics("color_palette", summary);
	return summary;
};
