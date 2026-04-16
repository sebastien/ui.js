import { beforeEach, describe, expect, test } from "bun:test";
import { MarkupProcessor } from "../src/js/ui/markup.js";
import { Argument } from "../src/js/ui/templates.js";
import { FormattingEffect } from "../src/js/ui/effects.js";
import { installDom } from "./test-utils.ts";

// Bug #4: onTemplateNode calls this.onTemplateEffects(node, children, scope)
// but the method signature is onTemplateEffects(node, scope, content, effects).
// The arguments `children` and `scope` are swapped at the call site.
describe("bug markup onTemplateEffects argument order", () => {
	beforeEach(() => {
		installDom();
	});

	test("onTemplateEffects uses scope for function argument resolution", () => {
		const proc = new MarkupProcessor();
		const el = document.createElement("div");
		el.setAttribute("x:text", "name");

		// The scope should contain named Arguments for resolving
		// the x:text expression's free variables.
		const nameArg = new Argument("name");
		const scope = { name: nameArg };
		const placeholder = "placeholder-content";

		// Correct call: onTemplateEffects(node, scope, content)
		// The scope is used by getFunction() to resolve "name" into
		// a reactive Argument. The content is passed as the
		// FormattingEffect placeholder.
		const effects = proc.onTemplateEffects(el, scope, placeholder);

		expect(effects.length).toBe(1);
		expect(effects[0]).toBeInstanceOf(FormattingEffect);
		// The placeholder should be the third argument (content),
		// not the scope object.
		expect(effects[0].placeholder).toBe(placeholder);
	});

	test("onTemplateNode passes arguments in correct order to onTemplateEffects", () => {
		let capturedScope;
		let capturedContent;
		class SpyProcessor extends MarkupProcessor {
			onTemplateEffects(node, scope, content, effects = []) {
				capturedScope = scope;
				capturedContent = content;
				return super.onTemplateEffects(node, scope, content, effects);
			}
		}
		const proc = new SpyProcessor();

		// Build a template node with x:text directive
		const template = document.createElement("template");
		template.setAttribute("name", "test");
		// Template content needs a child with x:text
		const div = document.createElement("div");
		div.setAttribute("x:text", "label");
		template.content.appendChild(div);

		// Process the template -- this calls onDeclaration to get scope,
		// then onTemplateNode which calls onTemplateEffects.
		// Bug: onTemplateNode passes (node, children, scope) instead of
		// (node, scope, children).
		const result = proc.onTemplate(template);
		expect(result).toBeDefined();

		// Regression check (#4): second argument must be scope and
		// third argument must be children/content.
		expect(capturedScope).toBeDefined();
		expect(Array.isArray(capturedContent)).toBe(true);
		expect(Array.isArray(capturedScope)).toBe(false);
	});
});
