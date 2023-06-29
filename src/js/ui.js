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

import { createComponent, controller } from "./ui/components.js";
import { loadTemplates, loadModule } from "./ui/loading.js";
import { StateTree } from "./ui/state.js";
import { stylesheet } from "./ui/css.js";
import { onWarning } from "./ui/utils.js";
import tokens from "./ui/tokens.js";

// --
// ## High-Level API
//
// This is the main function used to instanciate a set of components in a context.
export const ui = async (scope = document, data = {}, styles = undefined) => {
  const style = undefined;
  const state = data instanceof StateTree ? data : new StateTree(data);

  // DEBUG
  window.STATE = state;

  // NOTE: This is a side-effect and will register the styles as tokens.
  tokens(styles);

  return loadTemplates(document).then(({ templates, stylesheets, scripts }) => {
    const components = [];
    scripts.forEach((_) => {
      // NOTE: Adding a script node doesn't quite work. We could do
      // it in SSR, though.
      const type = _.getAttribute("type");
      switch (type) {
        case "importmap":
          break;
        case "javascript":
        case "module":
        case undefined:
          loadModule(_.innerText);
          break;
        default:
          onWarning(`Unsupported script type in template: ${type}`);
          break;
      }
    });
    stylesheets.forEach((_) => document.body.appendChild(_));
    if (!scope?.querySelectorAll) {
      onWarning("Could not expand template of scope", scope);
    } else {
      for (const node of scope.querySelectorAll("*[data-ui]")) {
        const c = createComponent(node, state);
        c && components.push(c);
      }
    }
    return { templates, components, stylesheets, style, state };
  });
};

export { tokens, stylesheet, controller };
export default ui;

// EOF
