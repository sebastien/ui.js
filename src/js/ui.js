import { globals, render } from "./ui/client.js";
import { $, h, select } from "./ui/hyperscript.js";
import { webcomponent } from "./ui/webcomponents.js";
import clsx from "./ui/clsx.js";

const ui = render;
Object.assign($, { clsx, webcomponent });

export { $, globals, h, render, select, ui, webcomponent };
export default Object.assign(ui);

// EOF
