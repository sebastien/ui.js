/*
     ___  ___  ___            ___  ________      
    |\  \|\  \|\  \          |\  \|\   ____\     
    \ \  \\\  \ \  \         \ \  \ \  \___|_    
     \ \  \\\  \ \  \      __ \ \  \ \_____  \   
      \ \  \\\  \ \  \ ___|\  \\_\  \|____|\  \  
       \ \_______\ \__\\__\ \________\____\_\  \ 
        \|_______|\|__\|__|\|________|\_________\
                                     \|_________|

*/

// --
// # UI.js
//
// *UI.js* is a toolkit/library/framework to create user interface for the
// web using plain JavaScript and HTML. It is designed for the Web and for
// Browsers, requiring no dedicated tooling or compiler, and to be easily
// embedded and used in different contexts.
//
// *UI.js* uses granular rendering directly based on data changes using
// a centralised state tree. Components can then subscribe and subsribe
// to data changes to be updated.

// TODO: This should probably be a rendereffector
//
// NOTE: We're storing the topic path of any component in the rendered
// component itself. This makes it possible to link a node to the context.
// export const render = (
//   root,
//   template,
//   data,
//   path = null,
//   state = undefined
// ) => {};

import { EffectScope } from "./ui/effectors.js";
import { Templates, template } from "./ui/templates.js";
import { PubSub } from "./ui/pubsub.js";
import { StateTree } from "./ui/state.js";
import { stylesheet } from "./ui/css.js";
import { parsePath } from "./ui/paths.js";
import { onError, makeKey } from "./ui/utils.js";
import tokens from "./ui/tokens.js";

const parseState = (text, context) => eval(`(data)=>(${text})`)(context);

// The StateBus manages the state tree, while the event bus is where
// components do their event wiring.
export const StateBus = new PubSub();
export const EventBus = new PubSub();
export const State = new StateTree(StateBus);

const createUI = (node, context) => {
  // We render the components
  const { ui, state, path } = node.dataset;
  const template = Templates.get(ui);
  const data = state ? parseState(state, context) : context;
  if (!template) {
    onError(`ui.render: Could not find template '${ui}'`, {
      node,
      ui,
    });
    return null;
  } else {
    // We instanciate the template onto the node
    const key = makeKey();
    const localPath = ["@local", key];
    const dataPath = path ? parsePath(path) : state ? ["@data", key] : [];
    data && State.patch(dataPath, data);
    const anchor = document.createComment(`⚓ ${key}`);
    node.parentElement.replaceChild(anchor, node);
    // TODO: We should pass the component number as well?
    const local = get(localPath);
    const scope = new EffectScope(State, dataPath, localPath, data, local);
    // TODO: We should keep the returned state
    const effector = template.apply(anchor, scope);
    EventBus.pub(
      [template.name, "Create"],
      { node, context, anchor, scope, effector },
      undefined,
      // We publish with no limit in history, as consumers will flush
      -1
    );
    return effector;
  }
};

const expandTemplates = (node) => {
  const promises = [];
  const templates = [];
  const stylesheets = [];
  const scripts = [];
  const extractNodes = (scope) =>
    [
      ["style", stylesheets],
      ["STYLE", stylesheets],
      ["script", scripts],
      ["SCRIPT", scripts],
    ].forEach(([name, collection]) => {
      if (!scope?.querySelectorAll) {
        console.warn("[uijs] Could not expand template of scope", scope);
      } else {
        scope.querySelectorAll(name).forEach((_) => {
          collection.push(_);
          _.parentElement.removeChild(_);
        });
      }
    });

  for (let tmpl of node.querySelectorAll("template")) {
    // This will register the templates in `templates`
    const src = tmpl.dataset.src;
    if (src) {
      promises.push(
        fetch(src)
          .then((_) => _.text())
          .then((_) => {
            const format =
              _.indexOf("http://www.w3.org/1999/xhtml") === -1
                ? "text/html"
                : "application/xhtml+xml";
            const doc = domParser.parseFromString(_, format);
            extractNodes(doc);
            doc.querySelectorAll("template").forEach((_) => {
              extractNodes(_.content);
              templates.push(template(_));
            });
            // We support .template for dynamically loaded chunks, which supports
            // preview.
            doc.querySelectorAll(".template").forEach((_) => {
              extractNodes(_);
              templates.push(template(_));
            });
          })
      );
    } else {
      extractNodes(tmpl.content);
      templates.push(template(tmpl));
    }
    tmpl.parentElement.removeChild(tmpl);
  }
  return Promise.all(promises).then(() => ({
    templates,
    stylesheets,
    scripts,
  }));
};

const loadModule = async (text) => {
  const blob = new Blob([text], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  // Dynamically import and execute the module
  try {
    const module = await import(url);
    return module;
  } catch (error) {
    onError("[ui] Unable to dynamically import JavaScript module:", error);
  } finally {
    // Clean up the URL to release the memory
    URL.revokeObjectURL(url);
  }
};

const domParser = new DOMParser();
export const ui = async (
  scope = document,
  context = {},
  styles = undefined
) => {
  const style = undefined;

  // NOTE: This is a side-effect and will register the styles as tokens.
  tokens(styles);

  return expandTemplates(document).then(
    ({ templates, stylesheets, scripts }) => {
      const components = [];
      scripts.forEach((_) => {
        // NOTE: Adding a script node doesn't quite work. We could do
        // it in SSR, though.
        loadModule(_.innerText);
      });
      stylesheets.forEach((_) => document.body.appendChild(_));
      if (!scope?.querySelectorAll) {
        console.warn("[uijs] Could not expand template of scope", scope);
      } else {
        for (const node of scope.querySelectorAll("*[data-ui]")) {
          const ui = createUI(node, context);
          ui && components.push(ui);
        }
      }

      return { templates, components, stylesheets, style };
    }
  );
};

const on = (handlers) =>
  Object.entries(handlers).reduce(
    (r, [k, v]) => ((r[k] = EventBus.sub(k, v)), r),
    {}
  );

const patch = (...args) => State.patch(...args);
const get = (...args) => State.get(...args);
const remove = (...args) => State.remove(...args);

// DEBUG
window.UI = { State, EventBus, StateBus };

export { on, patch, get, remove, tokens, stylesheet };
export default ui;

// EOF
