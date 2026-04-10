export const getJSON = (...args) => fetch(...args).then((_) => _.json());
export const getText = (...args) => fetch(...args).then((_) => _.text());
