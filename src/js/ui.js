import { render, globals } from "./ui/client.js";
import { h, $, select } from "./ui/hyperscript.js";
import { webcomponent } from "./ui/webcomponents.js";

const ui = render;

export { ui, render, globals, h, $, select, webcomponent };
export default ui;

// EOF
