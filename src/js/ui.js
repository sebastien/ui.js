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
// *UI.js* uses granular rendering direcly based on data changes using
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

import { TemplateEffector } from "./ui/effectors.js";
import { Templates, template } from "./ui/templates.js";
import { pub, sub, unsub } from "./ui/pubsub.js";
import { patch, resolve } from "./ui/state.js";
import { stylesheet } from "./ui/css.js";
import { onError } from "./ui/utils.js";
import tokens from "./ui/tokens.js";

const parseState = (text, context) => eval(`(data)=>(${text})`)(context);

export const ui = (scope = document, context = {}) => {
	const templates = Templates;

	for (let _ of document.querySelectorAll("template")) {
		// This will register the templates in `templates`
		template(_);
	}

	// We render the components
	for (const node of scope.querySelectorAll("*[data-ui]")) {
		const { ui, state } = node.dataset;
		const template = templates.get(ui);
		const data = parseState(state, context);
		if (!template) {
			onError(`ui.render: Could not find template '{ui}'`, {
				node,
				ui,
			});
		} else {
			// We instanciate the template onto the node
			patch(null, data);
			const anchor = document.createComment(node.outerHTML);
			node.parentElement.replaceChild(anchor, node);
			// TODO: We should keep the returned state
			template.apply(anchor, data, []);
		}
	}
};

export { pub, sub, unsub, patch, resolve, tokens, stylesheet };
export default ui;

// EOF - vim: et ts=2 sw=2
