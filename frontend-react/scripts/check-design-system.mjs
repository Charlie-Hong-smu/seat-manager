import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(frontendRoot, "..");

const files = {
  agents: resolve(repoRoot, "AGENTS.md"),
  design: resolve(repoRoot, "docs/DESIGN_SYSTEM.md"),
  primitives: resolve(frontendRoot, "src/app/components/ui.tsx"),
  studentPicker: resolve(frontendRoot, "src/app/components/StudentPicker.tsx"),
  selectionMotion: resolve(frontendRoot, "src/app/components/selectionMotion.ts"),
  theme: resolve(frontendRoot, "src/styles/theme.css"),
};

const [agents, design, primitives, studentPicker, selectionMotion, theme] = await Promise.all(
  Object.values(files).map(path => readFile(path, "utf8")),
);

const failures = [];
const requireText = (source, expected, location) => {
  if (!source.includes(expected)) failures.push(`${location} 缺少 ${expected}`);
};

requireText(agents, "docs/DESIGN_SYSTEM.md", "AGENTS.md");
requireText(agents, "pnpm check:design", "AGENTS.md");

for (const heading of ["## 1. 产品气质", "## 2. 唯一实现入口", "## 5. 动效规范", "## 7. 验收清单"]) {
  requireText(design, heading, "docs/DESIGN_SYSTEM.md");
}

for (const component of ["Button", "IconButton", "Card", "SegmentedControl", "AnimatedPopover", "ToolDrawer", "FileDropZone"]) {
  requireText(primitives, `export function ${component}`, "components/ui.tsx");
  requireText(design, `\`${component}\``, "docs/DESIGN_SYSTEM.md");
}

requireText(studentPicker, "export function StudentPicker", "components/StudentPicker.tsx");
requireText(selectionMotion, "export function animateSelectionTransfer", "components/selectionMotion.ts");

for (const token of [
  "--app-bg",
  "--app-surface",
  "--app-border",
  "--app-text",
  "--app-primary",
  "--app-ai",
  "--app-danger",
  "--app-radius-sm",
  "--app-radius-md",
  "--app-radius-lg",
  "--app-shadow-card",
  "--app-shadow-float",
]) {
  requireText(theme, `${token}:`, "styles/theme.css");
  requireText(design, `\`${token}\``, "docs/DESIGN_SYSTEM.md");
}

if (failures.length) {
  console.error("设计系统契约检查失败：");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("设计系统契约检查通过：规范入口、基础组件与核心令牌完整。");
