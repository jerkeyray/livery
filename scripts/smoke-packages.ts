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
  ["npm", "install", ...tarballs, "react@19", "react-dom@19", "--ignore-scripts"],
  consumerDirectory,
);
await writeFile(
  join(consumerDirectory, "smoke.mjs"),
  `import { boardSceneToSvg, compileVisual, exportHeadless, solvePinboard } from "@jerkeyray/core";
import { exportHeadlessPng } from "@jerkeyray/export-node";
import { createElkLayoutAdapter } from "@jerkeyray/layout-elk";
import { Livery, LiveryVisual } from "@jerkeyray/react";
import { mountLivery, mountLiveryVisual } from "@jerkeyray/web";

const result = await exportHeadless("flow installed { a -> b }", { format: "svg" });
if (!result.output?.startsWith("<svg")) throw new Error("Core SVG export failed.");
const visual = compileVisual(${JSON.stringify('figure installed {\n a = service("A")\n}')});
const board = visual.document ? solvePinboard(visual.document) : undefined;
if (!board?.ok || !boardSceneToSvg(board.scene).startsWith("<svg")) throw new Error("Programmable SVG export failed.");
if (typeof exportHeadlessPng !== "function") throw new Error("PNG export is missing.");
if (createElkLayoutAdapter().id !== "livery.elk-layered") throw new Error("ELK adapter is invalid.");
if (typeof Livery !== "function" || typeof LiveryVisual !== "function" || typeof mountLivery !== "function" || typeof mountLiveryVisual !== "function") throw new Error("Renderer exports are invalid.");
`,
);
await writeFile(join(consumerDirectory, "input.livery"), 'figure packed("Packed") {\n a = service("A")\n b = database("B")\n a.right -> b.left("ok")\n row(a, b, gap: lg)\n}\n');
await run(["node", "smoke.mjs"], consumerDirectory);
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

console.log(`Verified ${tarballs.length} package tarballs in ${temporary}`);

async function run(command: string[], cwd: string) {
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${exitCode}.`);
}
