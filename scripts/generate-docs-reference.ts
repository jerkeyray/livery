import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanguageCatalog } from "@jerkeyray/core";

const catalog = getLanguageCatalog();
const formatParameter = (parameter: (typeof catalog.calls)[number]["named"][number]) => {
  const values = parameter.values?.length ? ` (${parameter.values.join(" / ")})` : "";
  return `\`${parameter.name}${parameter.required ? "" : "?"}: ${parameter.type}${values}\``;
};
const lines = [
  "# Standard library",
  "",
  "This page is generated from `getLanguageCatalog()`.",
  "",
  "| Component | Category | Status | Description | Ports |",
  "| --- | --- | --- | --- | --- |",
  ...catalog.components.map((item) => `| \`${item.name}\` | ${item.category} | ${item.status} | ${item.description} | ${item.ports.join(", ")} |`),
  "",
  "## Language calls",
  "",
  "| Call | Category | Status | Contexts | Parameters |",
  "| --- | --- | --- | --- | --- |",
  ...catalog.calls.map((item) => `| \`${item.name}\` | ${item.category} | ${item.status} | ${item.contexts.join(", ")} | ${[...item.positional, ...(item.variadic ? [item.variadic] : []), ...item.named].map(formatParameter).join("<br>")} |`),
  "",
  "## Semantic tokens",
  "",
  ...catalog.tokens.map((token) => `- \`${token}\``),
  "",
  "Chart-oriented components are experimental in the public alpha. Supported technical components follow the compatibility policy documented in Migration.",
  "",
];
const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await writeFile(path.join(repositoryRoot, "apps/docs/alpha/standard-library.md"), lines.join("\n"));
