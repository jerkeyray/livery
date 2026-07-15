import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProgram } from "@jerkeyray/core";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.join(repositoryRoot, "apps/docs");
const files = await markdownFiles(root);
let examples = 0;
for (const file of files) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(/^<<<\s+([^\s{]+)\{livery\}\s*$/gm)) {
    const source = await readFile(path.resolve(path.dirname(file), match[1]!), "utf8");
    assertCompiles(source, `${file}: ${match[1]}`);
    examples += 1;
  }
  for (const match of markdown.matchAll(/```livery\n([\s\S]*?)```/g)) {
    assertCompiles(match[1]!, file);
    examples += 1;
  }
}
if (!examples) throw new Error("Documentation contains no compiled Livery examples.");
console.log(`Compiled ${examples} documentation examples across ${files.length} pages.`);

function assertCompiles(source: string, owner: string) {
  const result = compileProgram(source);
  const errors = result.diagnostics.filter(({ severity }) => severity === "error");
  if (!result.document || errors.length) throw new Error(`${owner} failed: ${errors.map(({ message }) => message).join(" ")}`);
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.flatMap((entry) => entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vitepress" ? []
    : entry.isDirectory() ? [markdownFiles(path.join(directory, entry.name))]
      : entry.name.endsWith(".md") ? [Promise.resolve([path.join(directory, entry.name)])] : []))).flat();
}
