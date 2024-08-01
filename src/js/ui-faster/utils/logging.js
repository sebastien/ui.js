export const onError = (origin, message, data) => {
	console.error("!!! ui:", origin, message, "▸", data);
};

const withScope = (scope) => {
	if (scope) {
		console.group("With scope");
		for (const k in scope) {
			console.log(` - ${k}:`, scope[k]);
		}

		console.groupEnd();
	}
};

const withNode = (node) => {
	if (node) {
		const text = typeof node === "string" ? node : node.outerHTML;
		console.log("In node:", text);
	}
};

const withInput = (input) => {
	if (input) {
		console.log("With input:", input);
	}
};

const withExtra = (extra) => {
	if (extra) {
		withInput(extra?.input);
		withNode(extra?.node);
		withScope(extra?.scope);
	}
};

export const onSyntaxError = (error, text, extra) => {
	console.group(`[uijs] Expression is invalid: "${text}"`);
	console.error(error);
	withExtra(extra);
	console.groupEnd();
};

export const onRuntimeError = (error, text, extra) => {
	console.group(`[uijs] Expression failed at runtime: "${text}"`);
	console.error(error);
	withExtra(extra);
	console.groupEnd();
};

// EOF
