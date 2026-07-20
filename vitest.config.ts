import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@liveryscript/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@liveryscript/export-node": fileURLToPath(new URL("./packages/export-node/src/index.ts", import.meta.url)),
      "@liveryscript/react": fileURLToPath(new URL("./packages/react/src/index.ts", import.meta.url)),
      "@liveryscript/web": fileURLToPath(new URL("./packages/web/src/index.ts", import.meta.url)),
    },
  },
  test: {
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
