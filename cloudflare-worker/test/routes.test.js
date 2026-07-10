import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ALLOWED_PATHS, ALLOWED_PREFIXES } from "../../netlify/functions/worker-proxy.mjs";
import { PUBLIC_POST_ROUTES, PUBLIC_ROUTE_PREFIXES } from "../worker-routes.js";

test("Netlify proxy uses the Worker public route contract", () => {
  assert.deepEqual(ALLOWED_PATHS, PUBLIC_POST_ROUTES);
  assert.deepEqual(ALLOWED_PREFIXES, PUBLIC_ROUTE_PREFIXES);
});

test("every public Worker POST handler is declared in the route contract", async () => {
  const sources = await Promise.all([
    readFile(new URL("../routes/license-routes.js", import.meta.url), "utf8"),
    readFile(new URL("../routes/ai-routes.js", import.meta.url), "utf8"),
  ]);
  const implemented = [...sources.join("\n").matchAll(/"(\/[^\"]+)"\s*:/g)].map(match => match[1]).sort();
  assert.deepEqual(implemented, [...PUBLIC_POST_ROUTES].sort());
});
