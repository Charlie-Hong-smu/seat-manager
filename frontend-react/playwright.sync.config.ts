import { defineConfig, devices } from "@playwright/test";
const commercial = process.env.E2E_EDITION === "commercial";
const port = Number(process.env.E2E_PORT) || (commercial ? 4296 : 4295);
const base = commercial ? "/" : "/seat-manager/";
const output = `.sync-e2e-dist/${commercial ? "commercial" : "zhang"}`;
export default defineConfig({
  testDir: "./e2e", testMatch: ["sync-enabled.spec.ts", "sync-fresh.spec.ts"], workers: 1,
  outputDir: `./.sync-e2e-results/${commercial ? "commercial" : "zhang"}`, reporter: [["list"]], timeout: 45_000,
  use: { baseURL: `http://127.0.0.1:${port}${base}`, trace: "retain-on-failure", serviceWorkers: "block" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `VITE_SYNC_AUTO_RELEASE=true VITE_EDITION=${commercial ? "commercial" : "zhang"} VITE_BASE=${base} pnpm exec vite build --outDir ${output} && VITE_BASE=${base} pnpm exec vite preview --outDir ${output} --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}${base}`, reuseExistingServer: false, timeout: 120_000,
  },
});
