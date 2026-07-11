import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { encode } from "gpt-tokenizer";

const comparisonsDirectory = path.resolve("fixtures/comparisons");
const files = await readdir(comparisonsDirectory);
const groups = new Map<string, Map<string, number>>();

for (const file of files.sort()) {
  const extension = path.extname(file).slice(1);
  const fixture = path.basename(file, path.extname(file));
  const source = await readFile(path.join(comparisonsDirectory, file), "utf8");
  const counts = groups.get(fixture) ?? new Map<string, number>();

  counts.set(extension, encode(source).length);
  groups.set(fixture, counts);
}

console.log("Token benchmark using gpt-tokenizer's default encoding\n");

for (const [fixture, counts] of groups) {
  console.log(fixture);
  for (const [format, tokens] of counts) {
    console.log(`  ${format.padEnd(8)} ${tokens}`);
  }
}
