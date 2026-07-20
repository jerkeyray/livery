import { defineConfig } from "tsdown";

const internalPackages = /^@liveryscript\/(?:cli|core|export-node|react|web)(?:\/.*)?$/;

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [internalPackages],
    neverBundle: ["@resvg/resvg-js", "react", "react-dom", /^react\//, "zod"],
    dts: {
      alwaysBundle: [internalPackages],
      neverBundle: ["@resvg/resvg-js", "react", "react-dom", /^react\//, "zod"],
    },
  },
  dts: true,
  entry: {
    index: "src/index.ts",
    web: "src/web.ts",
    react: "src/react.ts",
    node: "src/node.ts",
    cli: "src/cli.ts",
    styles: "src/styles.css",
  },
  format: ["esm"],
  sourcemap: true,
});
