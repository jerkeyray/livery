import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "livery-packages-"));
const tarballsDirectory = join(temporary, "tarballs");
const consumerDirectory = join(temporary, "consumer");
const packages = ["core", "web", "react", "layout-elk", "export-node", "cli"];

await mkdir(tarballsDirectory);
await mkdir(consumerDirectory);
for (const packageName of packages) {
  await run(["npm", "pack", "--dry-run", "--json"], join(root, "packages", packageName));
  await run(
    ["bun", "pm", "pack", "--destination", tarballsDirectory, "--quiet"],
    join(root, "packages", packageName),
  );
}

const tarballs = (await readdir(tarballsDirectory))
  .filter((name) => name.endsWith(".tgz"))
  .map((name) => join(tarballsDirectory, name));
if (tarballs.length !== packages.length) throw new Error(`Expected ${packages.length} tarballs.`);

await run(["npm", "init", "-y"], consumerDirectory);
await run(
  ["npm", "install", ...tarballs, "react@19", "react-dom@19", "@types/react@19", "@types/react-dom@19", "vite@8.1.4", "typescript@6.0.3", "--ignore-scripts"],
  consumerDirectory,
);
await writeFile(
  join(consumerDirectory, "smoke.mjs"),
  `import { boardSceneToSvg, compileVisual, createAgentGuide, exportHeadless, solvePinboard } from "@jerkeyray/core";
import { exportHeadlessPng, exportVisualPng } from "@jerkeyray/export-node";
import { createElkLayoutAdapter } from "@jerkeyray/layout-elk";
import { Livery, LiveryChatVisual, LiveryVisual } from "@jerkeyray/react";
import { mountLivery, mountLiveryVisual } from "@jerkeyray/web";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const result = await exportHeadless("flow installed { a -> b }", { format: "svg" });
if (!result.output?.startsWith("<svg")) throw new Error("Core SVG export failed.");
const visual = compileVisual(${JSON.stringify('figure installed {\n a = service("A")\n}')});
const board = visual.document ? solvePinboard(visual.document) : undefined;
if (!board?.ok || !boardSceneToSvg(board.scene).startsWith("<svg")) throw new Error("Programmable SVG export failed.");
if (typeof exportHeadlessPng !== "function") throw new Error("PNG export is missing.");
if (typeof exportVisualPng !== "function") throw new Error("Visual PNG export is missing.");
if (createElkLayoutAdapter().id !== "livery.elk-layered") throw new Error("ELK adapter is invalid.");
if (typeof Livery !== "function" || typeof LiveryVisual !== "function" || typeof LiveryChatVisual !== "function" || typeof mountLivery !== "function" || typeof mountLiveryVisual !== "function") throw new Error("Renderer exports are invalid.");
if (createAgentGuide({ mode: "compact" }).length < 100) throw new Error("Agent guide export is invalid.");
if (!renderToString(createElement(LiveryChatVisual, { source: "", streaming: true })).includes("livery-chat-visual")) throw new Error("React SSR failed.");
`,
);
await writeFile(join(consumerDirectory, "smoke.ts"), `
import type { LiveryVisualRevision } from "@jerkeyray/web";
import { createAgentGuide, type ResourcePolicy } from "@jerkeyray/core";
import { LiveryChatVisual, type LiveryChatVisualProps } from "@jerkeyray/react";
const revision: LiveryVisualRevision | undefined = undefined;
const policy: ResourcePolicy = { allowedImageHosts: ["assets.example.com"] };
const props: LiveryChatVisualProps = { source: "", streaming: true };
void revision; void policy; void props; void LiveryChatVisual; createAgentGuide({ mode: "reference" });
`);
await writeFile(join(consumerDirectory, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", noEmit: true, strict: true, target: "ES2022" }, include: ["smoke.ts"] }, null, 2));
await writeFile(join(consumerDirectory, "index.html"), '<div id="root"></div><script type="module" src="/src.jsx"></script>');
await writeFile(join(consumerDirectory, "src.jsx"), `import { createElement } from "react"; import { createRoot } from "react-dom/client"; import { LiveryChatVisual } from "@jerkeyray/react"; import "@jerkeyray/react/styles.css"; createRoot(document.getElementById("root")).render(createElement(LiveryChatVisual, { source: "", streaming: true }));`);
await writeFile(join(consumerDirectory, "input.livery"), 'figure packed("Packed") {\n a = service("A")\n b = database("B")\n a.right -> b.left("ok")\n row(a, b, gap: lg)\n}\n');
await run(["node", "smoke.mjs"], consumerDirectory);
await run(["bun", "smoke.mjs"], consumerDirectory);
await run([join(consumerDirectory, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"], consumerDirectory);
await run([join(consumerDirectory, "node_modules", ".bin", "vite"), "build"], consumerDirectory);
await run(
  [join(consumerDirectory, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.svg", "--layout", "fast"],
  consumerDirectory,
);
await run(
  [join(consumerDirectory, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.png", "--layout", "fast"],
  consumerDirectory,
);

const svg = await readFile(join(consumerDirectory, "packed.svg"), "utf8");
const png = await readFile(join(consumerDirectory, "packed.png"));
if (!svg.startsWith("<svg")) throw new Error("Packed CLI SVG export failed.");
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw new Error("Packed CLI PNG export failed.");
}

const react18Directory = join(temporary, "react18-consumer");
await mkdir(react18Directory);
await run(["npm", "init", "-y"], react18Directory);
await run(["npm", "install", ...tarballs, "react@18", "react-dom@18", "--ignore-scripts"], react18Directory);
await writeFile(join(react18Directory, "ssr.mjs"), `import { createElement } from "react"; import { renderToString } from "react-dom/server"; import { LiveryChatVisual } from "@jerkeyray/react"; const html = renderToString(createElement(LiveryChatVisual, { source: "", streaming: true })); if (!html.includes("livery-chat-visual")) throw new Error("React 18 SSR failed.");`);
await run(["node", "ssr.mjs"], react18Directory);

console.log(`Verified ${tarballs.length} package tarballs in ${temporary}`);

async function run(command: string[], cwd: string) {
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${exitCode}.`);
}
