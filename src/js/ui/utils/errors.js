export const NotImplementedError = () => new Error("NotImplementedError");
export const ValueError = (value) => new Error("ValueError", value);
export const RuntimeError = (value) => new Error("RuntimeError", value);
