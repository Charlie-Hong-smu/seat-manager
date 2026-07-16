import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve("dist");
const limits = { entry: 220 * 1024, chunk: 220 * 1024, precache: 2.25 * 1024 * 1024 };
const html = readFileSync(resolve(dist, "index.html"), "utf8");
const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
if (!entryMatch) throw new Error("无法从 dist/index.html 找到入口脚本");

const normalizeUrl = (url) => url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/seat-manager\//, "").replace(/^\//, "");
const entry = normalizeUrl(entryMatch[1]);
const sw = readFileSync(resolve(dist, "sw.js"), "utf8");
const precacheUrls = [...sw.matchAll(/\{url:"([^"]+)"/g)].map((match) => normalizeUrl(match[1]));
const jsAssets = [...new Set(precacheUrls.filter((url) => url.endsWith(".js") && !url.startsWith("vendor/")))];

function gzipBytes(file) {
  return gzipSync(readFileSync(resolve(dist, file))).byteLength;
}

const entryGzip = gzipBytes(entry);
const oversizedChunks = jsAssets.filter((file) => file !== entry && gzipBytes(file) > limits.chunk);
const precacheBytes = [...new Set(precacheUrls)].reduce((total, file) => {
  try { return total + statSync(resolve(dist, file)).size; } catch { return total; }
}, 0);
const xlsx = precacheUrls.find((url) => /xlsx.*\.js$/i.test(url));

console.log(`入口 JS gzip: ${(entryGzip / 1024).toFixed(1)} KiB / 220 KiB`);
console.log(`最大异步 JS gzip: ${Math.max(0, ...jsAssets.filter((file) => file !== entry).map(gzipBytes)) / 1024 | 0} KiB / 220 KiB`);
console.log(`PWA precache: ${(precacheBytes / 1024 / 1024).toFixed(2)} MiB / 2.25 MiB`);
if (xlsx) console.log(`XLSX vendor: ${(statSync(resolve(dist, xlsx)).size / 1024).toFixed(1)} KiB（单独统计）`);

const failures = [];
if (entryGzip > limits.entry) failures.push(`入口 ${entryGzip} > ${limits.entry}`);
if (oversizedChunks.length) failures.push(`异步 chunk 超限: ${oversizedChunks.join(", ")}`);
if (precacheBytes > limits.precache) failures.push(`precache ${precacheBytes} > ${limits.precache}`);
if (failures.length) throw new Error(`构建体积预算失败：${failures.join("；")}`);
