import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173/seat-manager/",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  webServer: {
    command: "pnpm build:zhang && pnpm preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/seat-manager/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
