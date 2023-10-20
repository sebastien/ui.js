export const onWarning = (message, ...context) => {
  console.warn("[uijs]", message, ...context);
};
export const onError = (message, ...context) => {
  console.error("[uijs]", message, ...context);
};
