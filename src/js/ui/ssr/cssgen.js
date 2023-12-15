import { map, range } from "../utils/collections.js";
import { unlink } from "node:fs/promises";

if (!globalThis.Bun) {
	throw new Error("Bun is required to run this");
}

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
			o = ts;
			break;
		} else {
			o = md.index + md[0].length;
		}
		const me = match(RE_TMPL_END, text, o);
		if (!me) {
			o = ts;
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

const process = function* (text) {
	for (const r of findRegions(text)) {
		switch (r.type) {
			case "tmpl":
				{
					yield r.pre;
					const v = eval(`({range,map})=>(${r.tmpl})`)({
						range,
						map,
					});
					if (typeof v === "string") {
						yield v;
					} else if (v instanceof Array) {
						for (const _ of v) {
							yield _;
						}
					}
				}
				break;
			default:
				yield r.text;
		}
	}
};

const rewrite = async (path) => {
	const input = Bun.file(path);
	const text = await input.text();
	const output = Bun.file(`${path}.tmp`);
	const out = output.writer();
	for (const chunk of process(text)) {
		await Bun.write(Bun.stdout, chunk);
		await out.write(chunk);
	}
	await out.flush();
};

// TODO: Should wrap this in a CLI
for (const path of Bun.argv.slice(2)) {
	rewrite(path);
}

// EOF
