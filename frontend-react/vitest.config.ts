import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/app/state/{backupStorage,classDuties,classFundActions,dormitoryActions,studentActions,aiStudentContext,aiAssistantPayload,aiAssistantResult,commentStorage,commentPersistence,seatWorkflow,seatActions}.ts",
      ],
      thresholds: {
        statements: 70,
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
