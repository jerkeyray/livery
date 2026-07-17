import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@jerkeyray/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@jerkeyray/export-node": fileURLToPath(new URL("./packages/export-node/src/index.ts", import.meta.url)),
      "@jerkeyray/react": fileURLToPath(new URL("./packages/react/src/index.ts", import.meta.url)),
      "@jerkeyray/web": fileURLToPath(new URL("./packages/web/src/index.ts", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
