import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  expect: {
    // Chromium text rasterization differs between macOS-authored baselines and
    // the Ubuntu visual runner. Geometry and SVG semantics are asserted
    // separately, so CI permits only the stable cross-platform pixel drift.
    toHaveScreenshot: { maxDiffPixelRatio: process.env.CI ? 0.05 : 0.005 },
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "bunx vite apps/playground --host 127.0.0.1 --port 4173 --force",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
