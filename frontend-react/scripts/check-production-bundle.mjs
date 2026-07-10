import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const forbidden = ["TEST-ONLY-CODE", "e2e-commercial-token", "e2e-license", "FULL-DEVICE", "REJECTED"];
const files = readdirSync(resolve("dist/assets")).filter((file) => file.endsWith(".js"));
const matches = [];
for (const file of files) {
  const source = readFileSync(resolve("dist/assets", file), "utf8");
  for (const marker of forbidden) if (source.includes(marker)) matches.push(`${file}: ${marker}`);
}
if (matches.length) throw new Error(`生产包包含 E2E 标记：${matches.join(", ")}`);
console.log(`生产包检查通过：${files.length} 个 JS 文件未包含测试授权或模拟响应。`);
