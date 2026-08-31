import { defineConfig, devices } from "@playwright/test";

const commercial = process.env.E2E_EDITION === "commercial";
const port = commercial ? 4174 : 4173;
const basePath = commercial ? "/" : "/seat-manager/";

export default defineConfig({
  workers: process.env.CI ? undefined : 1,
  testDir: "./e2e",
  testMatch: commercial ? ["commercial.spec.ts", "followup-grouping.spec.ts"] : ["app-state.spec.ts", "pwa.spec.ts", "followup-grouping.spec.ts"],
  outputDir: "./test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: commercial
      ? `pnpm build:commercial && VITE_BASE=/ pnpm preview --host 127.0.0.1 --port ${port}`
      : `pnpm build:zhang && pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
