import { defineConfig, devices } from "@playwright/test";

const commercial = process.env.E2E_EDITION === "commercial";
const port = Number(process.env.E2E_PORT) || (commercial ? 4174 : 4173);
const basePath = commercial ? "/" : "/seat-manager/";
const isolated = process.env.E2E_ISOLATED_BUILD === "true";
const edition = commercial ? "commercial" : "zhang";
const outDir = isolated ? `.full-e2e-dist/${edition}` : "dist";
const buildOutput = isolated ? ` --outDir ${outDir}` : "";

export default defineConfig({
  fullyParallel: Boolean(process.env.CI),
  // Frame-by-frame motion assertions need an uncontended browser per runner.
  // The two Zhang matrix shards still run concurrently on separate runners.
  workers: 1,
  testDir: "./e2e",
  testMatch: commercial ? ["teacher-workflow-safety.spec.ts", "license-admin-safety.spec.ts", "teacher-data-safety.spec.ts", "cloud-sync.spec.ts", "safe-sync.spec.ts", "lazy-workspaces.spec.ts", "commercial.spec.ts", "auth-persistence.spec.ts", "followup-grouping.spec.ts", "seat-rotation-history.spec.ts", "seat-mode-transition.spec.ts", "functional-state.spec.ts", "registration-settings.spec.ts", "workbench-safety.spec.ts", "class-duties.spec.ts", "app-motion.spec.ts", "mobile-usability.spec.ts", "mobile-classroom.spec.ts"] : ["teacher-workflow-safety.spec.ts", "license-admin-safety.spec.ts", "teacher-data-safety.spec.ts", "cloud-sync.spec.ts", "safe-sync.spec.ts", "lazy-workspaces.spec.ts", "app-state.spec.ts", "pwa.spec.ts", "auth-persistence.spec.ts", "followup-grouping.spec.ts", "seat-rotation-history.spec.ts", "seat-mode-transition.spec.ts", "functional-state.spec.ts", "registration-settings.spec.ts", "workbench-safety.spec.ts", "class-duties.spec.ts", "app-motion.spec.ts", "mobile-usability.spec.ts", "mobile-classroom.spec.ts"],
  // Safe snapshot transport remains test-only; both editions share wire semantics.
  outputDir: isolated ? `./test-results/${edition}` : "./test-results",
  reporter: [["list"], ["html", { outputFolder: isolated ? `playwright-report/${edition}` : "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: commercial
      ? `pnpm build:commercial${buildOutput} && VITE_BASE=/ pnpm preview --outDir ${outDir} --host 127.0.0.1 --port ${port}`
      : `pnpm build:zhang${buildOutput} && pnpm preview --outDir ${outDir} --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
