import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/controller.ts", "src/layout-controller.ts", "src/motion.ts"],
  format: ["esm"],
  sourcemap: true,
});
