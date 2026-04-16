#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "./index.js";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath) {
	console.error("Usage: node src/js/uic/cli.js <input.jsx> [output.js]");
	process.exit(1);
}

const source = readFileSync(resolve(process.cwd(), inputPath), "utf8");
const { code } = compile(source);

if (outputPath) {
	writeFileSync(resolve(process.cwd(), outputPath), code, "utf8");
} else {
	process.stdout.write(code);
}

// EOF
