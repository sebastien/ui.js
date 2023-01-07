import S from "./select.js";

const visualize = (
  context,
  data,
  onCreate,
  onUpdate = undefined,
  onRemove = undefined
) => {};

export class ComponentTemplate {}

export const template = (node) => {
  console.log("TEMPLATE", node);
  S("*[out-value]", node).forEach((_) => {
    console.log("Outputs:", _);
  });
};

export const render = () => {
  S("template").forEach((_) => {
    template(_);
  });
};

export const reload = (url) => {
  fetch(url, { method: "HEAD" }).then((_) => {
    console.log(_);
  });
};

export default render;
// EOF - vim: et
