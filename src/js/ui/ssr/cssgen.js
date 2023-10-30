import { map, range } from "../utils/collections.js";

const RE_TMPL_START = new RegExp("/\\*\\s*@tmpl", "g");
const RE_TMPL_MID = new RegExp("\\*/", "g");
const RE_TMPL_END = new RegExp("/\\*\\s*@end\\s*\\*/", "g");

const match = (re, text, index = 0) => {
  re.lastIndex = index;
  return re.exec(text);
};

const findRegions = function* (text) {
  let o = 0;
  const n = text.length;
  while (o < n) {
    const ms = match(RE_TMPL_START, text, o);
    const ts = o;
    if (!ms) {
      break;
    } else {
      o = ms.index + ms[0].length;
    }
    const md = match(RE_TMPL_MID, text, o);
    if (!md) {
      break;
    } else {
      o = md.index + md[0].length;
    }
    const me = match(RE_TMPL_END, text, o);
    if (!me) {
      break;
    } else {
      o = me.index;
    }
    if (ts < ms.index) {
      yield {
        start: ts,
        end: ms.index,
        text: text.slice(ts, ms.index),
        type: "text",
      };
    }
    yield {
      type: "tmpl",
      start: ms.index,
      end: me.index,
      pre: text.slice(ms.index, md.index + md[0].length),
      tmpl: text
        .slice(ms.index + ms[0].length, md.index)
        .split("\n")
        .map((_) => _.replace(/^\s*\*/, "").trim())
        .filter((_) => _.length)
        .join("\n"),
    };
  }
  if (o < n) {
    yield {
      start: o,
      end: n,
      text: text.slice(o),
      type: "text",
    };
  }
};

const out = (value) => {
  if (typeof value === "string") {
    console.log(value);
  } else if (value instanceof Array) {
    for (const _ of value) {
      console.log(_);
    }
  }
};

const process = async (path) => {
  const text = await Bun.file(path).text();
  for (const r of findRegions(text)) {
    switch (r.type) {
      case "tmpl":
        out(r.pre);
        out(eval(`({range,map})=>(${r.tmpl})`)({ range, map }));
        break;
      default:
        out(r.text);
    }
  }
};

for (const path of Bun.argv.slice(2)) {
  await process(path);
}
// EOF
