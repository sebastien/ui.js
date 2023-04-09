import { list } from "./utils.js";

export const bind = (node, handlers) =>
  (handlers &&
    Object.entries(handlers).forEach(([k, v]) =>
      list(node).forEach((_) => _.addEventListener(k, v))
    )) ||
  node;

export const unbind = (node, handlers) =>
  (handlers &&
    Object.entries(handlers).forEach(([k, v]) =>
      list(node).forEach((_) => _.removeEventListener(k, v))
    )) ||
  node;

export const drag = (event, move, end) => {
  const dragging = {
    node: event.target,
    pointerEvents: event.target.style.pointerEvents,
    userSelect: event.target.style.userSelect,
  };
  const handlers = {
    mousemove: (event) => {
      move && move(event);
    },
    mouseup: (event) => {
      dragging.node.style.pointerEvents = dragging.pointerEvents;
      dragging.node.style.userSelect = dragging.userSelect;
      unbind(window.document.body, handlers);
      end && end(event);
    },
  };
  event.target.style.pointerEvents = "none";
  event.target.style.userSelect = "none";
  bind(window.document.body, handlers);
};

// EOF
