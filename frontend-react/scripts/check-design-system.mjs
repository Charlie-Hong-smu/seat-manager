import { readdir, readFile } from "node:fs/promises";
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
  commentEditor: resolve(frontendRoot, "src/app/components/commentEditor.ts"),
  theme: resolve(frontendRoot, "src/styles/theme.css"),
};

const [agents, design, primitives, studentPicker, selectionMotion, commentEditor, theme] = await Promise.all(
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

for (const component of ["Button", "IconButton", "Card", "SegmentedControl", "AnimatedPopover", "ConfirmDialog", "AiGenerationPanel", "ToolDrawer", "FileDropZone"]) {
  requireText(primitives, `export function ${component}`, "components/ui.tsx");
  requireText(design, `\`${component}\``, "docs/DESIGN_SYSTEM.md");
}

requireText(design, "禁止使用 `window.confirm`", "docs/DESIGN_SYSTEM.md");
requireText(design, "不使用 `window.alert`", "docs/DESIGN_SYSTEM.md");
requireText(design, "脱敏占位身份", "docs/DESIGN_SYSTEM.md");
requireText(design, "旧缓存读取", "docs/DESIGN_SYSTEM.md");
requireText(primitives, "export function useAppDialog", "components/ui.tsx");

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

for (const path of await collectSourceFiles(resolve(frontendRoot, "src/app"))) {
  const source = await readFile(path, "utf8");
  if (/window\.(confirm|alert)\s*\(/.test(source)) failures.push(`${path.replace(frontendRoot, "frontend-react")} 仍在使用浏览器原生确认或提示框`);
}

requireText(studentPicker, "export function StudentPicker", "components/StudentPicker.tsx");
requireText(selectionMotion, "export function animateSelectionTransfer", "components/selectionMotion.ts");
requireText(commentEditor, "export function buildStudentCommentDraft", "components/commentEditor.ts");
requireText(design, "`commentEditor.ts`", "docs/DESIGN_SYSTEM.md");

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
