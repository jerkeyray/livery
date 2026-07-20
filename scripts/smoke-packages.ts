import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "liveryscript-package-"));
const tarballsDirectory = join(temporary, "tarballs");
const coreConsumer = join(temporary, "core-consumer");
const fullConsumer = join(temporary, "full-consumer");
const react18Consumer = join(temporary, "react18-consumer");
const bunConsumer = join(temporary, "bun-consumer");

await mkdir(tarballsDirectory);
await run(["npm", "pack", "--dry-run", "--json"], join(root, "packages", "liveryscript"));
await run(["bun", "pm", "pack", "--destination", tarballsDirectory, "--quiet"], join(root, "packages", "liveryscript"));
const tarballs = (await readdir(tarballsDirectory)).filter((name) => name.endsWith(".tgz"));
if (tarballs.length !== 1) throw new Error(`Expected one liveryscript tarball, received ${tarballs.length}.`);
const tarball = join(tarballsDirectory, tarballs[0]!);

await mkdir(coreConsumer);
await run(["npm", "init", "-y"], coreConsumer);
await run(["npm", "install", tarball, "typescript@6.0.3", "--ignore-scripts"], coreConsumer);
await writeFile(join(coreConsumer, "input.livery"), `figure packed("Packed") {
  a = service("A")
  b = database("B")
  link = connect(a.right, b.left, label: "ok", role: primary)
  flow(a, b, direction: right)
}\n`);
await writeFile(join(coreConsumer, "smoke.mjs"), `
import { compileVisual, createAgentGuide, exportVisual, render } from "liveryscript";
import { mountLiveryVisual } from "liveryscript/web";
const source = 'figure installed { a = service("A") }';
if (!render(source, { width: 480 }).svg?.startsWith("<svg")) throw new Error("Core render failed.");
if (!exportVisual(source, { format: "json", width: 480 }).output) throw new Error("JSON export failed.");
if (!compileVisual(source).document) throw new Error("Compiler export failed.");
if (createAgentGuide({ mode: "compact" }).length < 100) throw new Error("Agent guide export failed.");
if (typeof mountLiveryVisual !== "function") throw new Error("Web export failed.");
`);
await writeFile(join(coreConsumer, "smoke.ts"), `
import { createAgentGuide, type ResourcePolicy } from "liveryscript";
import type { LiveryVisualRevision } from "liveryscript/web";
const revision: LiveryVisualRevision | undefined = undefined;
const policy: ResourcePolicy = { allowedImageHosts: ["assets.example.com"] };
void revision; void policy; createAgentGuide({ mode: "reference" });
`);
await writeFile(join(coreConsumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler", noEmit: true, strict: true, target: "ES2022" }, include: ["smoke.ts"] }, null, 2));
await run(["node", "smoke.mjs"], coreConsumer);
await run(["bun", "smoke.mjs"], coreConsumer);
await run([join(coreConsumer, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"], coreConsumer);
await run([join(coreConsumer, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.svg"], coreConsumer);
await run([join(coreConsumer, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.json", "--pretty"], coreConsumer);
const missingPng = await run([join(coreConsumer, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.png"], coreConsumer, true);
if (missingPng.exitCode === 0 || !missingPng.stderr.includes("PNG export requires the optional @resvg/resvg-js package")) {
  throw new Error(`Missing PNG dependency did not produce the expected error: ${missingPng.stderr}`);
}

await mkdir(fullConsumer);
await run(["npm", "init", "-y"], fullConsumer);
await run(["npm", "install", tarball, "@resvg/resvg-js@2.6.2", "react@19", "react-dom@19", "@types/react@19", "@types/react-dom@19", "vite@8.1.4", "typescript@6.0.3", "--ignore-scripts"], fullConsumer);
await writeFile(join(fullConsumer, "smoke.mjs"), `
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { LiveryChatVisual, LiveryVisual } from "liveryscript/react";
import { exportVisualPng } from "liveryscript/node";
const source = 'figure installed { a = service("A") }';
if (!renderToString(createElement(LiveryChatVisual, { source: "", streaming: true })).includes("livery-chat-visual")) throw new Error("React SSR failed.");
if (typeof LiveryVisual !== "function") throw new Error("React export failed.");
const png = exportVisualPng(source, { width: 480 });
if (!(png.output instanceof Uint8Array) || png.output[0] !== 137) throw new Error("PNG export failed.");
`);
await writeFile(join(fullConsumer, "src.jsx"), `import { createElement } from "react"; import { createRoot } from "react-dom/client"; import { LiveryChatVisual } from "liveryscript/react"; import "liveryscript/styles.css"; createRoot(document.getElementById("root")).render(createElement(LiveryChatVisual, { source: "", streaming: true }));`);
await writeFile(join(fullConsumer, "index.html"), '<div id="root"></div><script type="module" src="/src.jsx"></script>');
await writeFile(join(fullConsumer, "input.livery"), await readFile(join(coreConsumer, "input.livery"), "utf8"));
await run(["node", "smoke.mjs"], fullConsumer);
await run([join(fullConsumer, "node_modules", ".bin", "vite"), "build"], fullConsumer);
await run([join(fullConsumer, "node_modules", ".bin", "livery"), "input.livery", "-o", "packed.png"], fullConsumer);
const png = await readFile(join(fullConsumer, "packed.png"));
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Packed CLI PNG failed.");

await mkdir(react18Consumer);
await run(["npm", "init", "-y"], react18Consumer);
await run(["npm", "install", tarball, "react@18", "react-dom@18", "--ignore-scripts"], react18Consumer);
await writeFile(join(react18Consumer, "ssr.mjs"), `import { createElement } from "react"; import { renderToString } from "react-dom/server"; import { LiveryChatVisual } from "liveryscript/react"; if (!renderToString(createElement(LiveryChatVisual, { source: "", streaming: true })).includes("livery-chat-visual")) throw new Error("React 18 SSR failed.");`);
await run(["node", "ssr.mjs"], react18Consumer);

await mkdir(bunConsumer);
await writeFile(join(bunConsumer, "package.json"), JSON.stringify({ name: "bun-consumer", private: true, type: "module" }, null, 2));
await run(["bun", "add", tarball, "--ignore-scripts"], bunConsumer);
await writeFile(join(bunConsumer, "smoke.mjs"), `import { render } from "liveryscript"; const result = render('figure bun_consumer { a = service("A") }', { width: 480 }); if (!result.svg?.startsWith("<svg")) throw new Error("Bun install render failed.");`);
await run(["bun", "smoke.mjs"], bunConsumer);

console.log(`Verified liveryscript in clean npm and Bun consumers at ${temporary}`);

async function run(command: string[], cwd: string, captureFailure = false) {
  let stdout = "";
  let stderr = "";
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, stdio: captureFailure ? "pipe" : "inherit" });
    if (captureFailure) {
      child.stdout?.on("data", (value) => { stdout += String(value); });
      child.stderr?.on("data", (value) => { stderr += String(value); });
    }
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (!captureFailure && exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${exitCode}.`);
  return { exitCode, stdout, stderr };
}
