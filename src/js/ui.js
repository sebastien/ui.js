import { globals, render } from "./ui/client.js";
import { $, h, select } from "./ui/hyperscript.js";
import { webcomponent } from "./ui/webcomponents.js";

const ui = render;

export { $, globals, h, render, select, ui, webcomponent };
export default ui;

// EOF
