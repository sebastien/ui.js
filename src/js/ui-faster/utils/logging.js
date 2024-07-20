export const onError = (origin, message, data) => {
	console.error("!!! ui:", origin, message, "▸", data);
};

export const onSyntaxError = (error, text, scope, html) => {
	console.group(`[uijs] Expression is invalid: "${text}"`);
	console.error(error);
	console.log("In node:", html);
	console.group("With scope");
	for (const k in scope) {
		console.log(` - ${k}:`, scope[k]);
	}
	console.groupEnd();
	console.groupEnd();
};
// EOF
