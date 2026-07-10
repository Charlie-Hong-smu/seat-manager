import assert from "node:assert/strict";
import test from "node:test";

import worker from "../deepseek-ai-worker.js";

test("returns stable method and route errors", async () => {
  const methodResponse = await worker.fetch(new Request("https://worker.example/auth"), {});
  assert.equal(methodResponse.status, 405);
  assert.deepEqual(await methodResponse.json(), { error: "method_not_allowed" });

  const routeResponse = await worker.fetch(new Request("https://worker.example/unknown", { method: "POST" }), {});
  assert.equal(routeResponse.status, 404);
  assert.deepEqual(await routeResponse.json(), { error: "not_found" });
});

test("preserves CORS on unexpected handler failures without leaking details", async () => {
  const request = new Request("https://worker.example/license/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://seat-manager-commercial.pages.dev" },
    body: JSON.stringify({ productCode: "valid-looking-code", deviceId: "device-1" }),
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://seat-manager-commercial.pages.dev",
    PRODUCT_TOKEN_SECRET: "test-secret",
    SEAT_MANAGER_KV: { get: async () => { throw new Error("sensitive-internal-detail"); } },
  });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://seat-manager-commercial.pages.dev");
  const text = await response.text();
  assert.equal(text, JSON.stringify({ error: "internal_error" }));
  assert.equal(text.includes("sensitive-internal-detail"), false);
});

test("rejects oversized auth payloads before business handling", async () => {
  const response = await worker.fetch(new Request("https://worker.example/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: "x".repeat(21 * 1024) }),
  }), { TOKEN_SECRET: "test-secret", AI_ACCESS_CODE_HASH: "expected-hash" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "bad_request" });
});
