const assets = [
  ["node_modules/elkjs/lib/elk-worker.min.js", "dist/elk-worker.min.js"],
  ["node_modules/elkjs/LICENSE.md", "dist/ELKJS-LICENSE.md"],
] as const;

await Promise.all(assets.map(([source, target]) => Bun.write(target, Bun.file(source))));
await Bun.write("dist/elk-worker.min.d.ts", "export {};\n");
