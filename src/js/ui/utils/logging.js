import Options from "./options.js";

export const onWarning = (message, ...context) => {
	console.warn("[uijs]", message, ...context);
};
export const onError = (message, ...context) => {
	console.error("[uijs]", message, ...context);
};
export const onInfo = (message, ...context) => {
	console.log("[uijs]", message, ...context);
};
export const onDebug = (message, ...context) => {
	Options.debug && console.log("[uijs]", message, ...context);
};
