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
import { pub, sub, unsub } from "./ui/pubsub.js";
import { State, patch, get, remove } from "./ui/state.js";
import { stylesheet } from "./ui/css.js";
import { parsePath } from "./ui/paths.js";
import { onError, makeKey } from "./ui/utils.js";
import tokens from "./ui/tokens.js";

const parseState = (text, context) => eval(`(data)=>(${text})`)(context);

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
    data && patch(dataPath, data);
    const anchor = document.createComment(`⚓ ${key}`);
    node.parentElement.replaceChild(anchor, node);
    // TODO: We should pass the component number as well?
    const local = get(localPath);
    // TODO: We should keep the returned state
    return template.apply(
      anchor,
      new EffectScope(State, dataPath, localPath, data, local)
    );
  }
};

const expandTemplates = (node) => {
  const promises = [];
  const templates = [];
  for (let tmpl of node.querySelectorAll("template")) {
    // This will register the templates in `templates`
    const src = tmpl.dataset.src;
    if (src) {
      promises.push(
        fetch(src)
          .then((_) => _.text())
          .then((_) => {
            const doc = domParser.parseFromString(_, "text/html");
            doc.querySelectorAll("template").forEach((_) => {
              templates.push(template(_));
            });
          })
      );
    } else {
      templates.push(template(tmpl));
    }
    tmpl.parentElement.removeChild(tmpl);
  }
  return Promise.all(promises).then(() => templates);
};

const domParser = new DOMParser();
export const ui = (scope = document, context = {}, styles = undefined) => {
  const style = undefined;

  // NOTE: This is a side-effect and will register the styles as tokens.
  tokens(styles);

  return expandTemplates(document).then((templates) => {
    const components = [];
    for (const node of scope.querySelectorAll("*[data-ui]")) {
      const ui = createUI(node, context);
      ui && components.push(ui);
    }

    return { templates, components, style };
  });
};

const on = (handlers) =>
  Object.entries(handlers).reduce((r, [k, v]) => ((r[k] = sub(k, v)), r), {});

export { on, pub, sub, unsub, patch, get, remove, tokens, stylesheet };
export default ui;

// EOF
