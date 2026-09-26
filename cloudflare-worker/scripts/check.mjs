import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const directory of [".", "routes"]) {
  for (const name of (await readdir(new URL(`${directory}/`, new URL("../", import.meta.url)))).sort()) {
    if (!name.endsWith(".js")) continue;
    const result = spawnSync(process.execPath, ["--check", `${directory}/${name}`], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
