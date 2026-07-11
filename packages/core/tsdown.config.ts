import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: ["zod"],
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  sourcemap: true,
});
