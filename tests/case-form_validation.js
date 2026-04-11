import { h, $ } from "../src/js/ui/hyperscript.js";
import {
	countDomNodes,
	measure,
	printMetrics,
	settle,
	summarizeRuns,
} from "./case-harness.js";
import { mountCase } from "./case-mount.js";

const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const createFormValidationCase = () => {
	const form = $.cell({ name: "", email: "", password: "" });
	let context;
	let stateForm = { name: "", email: "", password: "" };

	const setField = (field, value) => {
		stateForm = { ...stateForm, [field]: value };
		form.set(stateForm, true, context);
	};

	const isValid = form.apply((value) =>
		Boolean(
			(value?.name ?? "").trim().length >= 2 &&
			validateEmail(value?.email ?? "") &&
			(value?.password ?? "").length >= 8
		)
	);

	const App = () =>
		h.form(
			{ "data-role": "validation-form" },
			h.label(
				"Name",
				h.input({
					"data-role": "name",
					value: form.apply((value) => value?.name ?? ""),
					onInput: (event) => setField("name", event.target.value),
				})
			),
			h.label(
				"Email",
				h.input({
					"data-role": "email",
					value: form.apply((value) => value?.email ?? ""),
					onInput: (event) => setField("email", event.target.value),
				})
			),
			h.label(
				"Password",
				h.input({
					"data-role": "password",
					type: "password",
					value: form.apply((value) => value?.password ?? ""),
					onInput: (event) => setField("password", event.target.value),
				})
			),
			h.button(
				{ "data-role": "submit", disabled: isValid.apply((ok) => (ok ? null : true)) },
				"Submit"
			)
		);

	const mount = (root) => {
		const mounted = mountCase(App, root, {});
		context = mounted.derivedContext;
		stateForm = { name: "", email: "", password: "" };
		form.observable(context);
		form.set(stateForm, true, context);
		return mounted;
	};

	return {
		mount,
		setField,
		isValid: () =>
			Boolean(
				stateForm.name.trim().length >= 2 &&
				validateEmail(stateForm.email) &&
				stateForm.password.length >= 8
			),
		getForm: () => ({ ...stateForm }),
	};
};

export const runFormValidationBenchmark = async ({ root, runs = 12 } = {}) => {
	const allRuns = [];
	for (let runIndex = 0; runIndex < runs; runIndex++) {
		const api = createFormValidationCase();
		root.replaceChildren();
		const mountRes = await measure(async () => {
			api.mount(root);
			await settle();
		});
		const domBefore = countDomNodes(root);
		const interaction = await measure(async () => {
			for (let i = 0; i < 220; i++) {
				api.setField("name", `User ${i}`);
				api.setField("email", `user${i}@example.com`);
				api.setField("password", `p4ssword-${i}`);
			}
			await settle();
		});
		allRuns.push({
			mount_time_ms: mountRes.duration,
			interaction_total_ms: interaction.duration,
			dom_nodes_before: domBefore,
			dom_nodes_after: countDomNodes(root),
			is_valid: api.isValid(),
		});
	}

	const summary = summarizeRuns("form_validation", allRuns, (runsData) => ({
		dom_nodes_before: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_before, 0) / runsData.length
		),
		dom_nodes_after: Math.round(
			runsData.reduce((acc, run) => acc + run.dom_nodes_after, 0) / runsData.length
		),
		is_valid: Boolean(runsData.at(-1)?.is_valid),
	}));
	printMetrics("form_validation", summary);
	return summary;
};
