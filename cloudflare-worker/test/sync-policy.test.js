import assert from "node:assert/strict";
import test from "node:test";
import { automaticSpaceAllowed } from "../worker-sync-policy.js";

test("automatic allowlist rejects missing, malformed and non-exact spaces", () => {
  const key = "seat-manager:license:synthetic-policy:state";
  for (const value of [undefined, "", "broken", "null", "{}", '"synthetic-policy"', "[]", '["*"]', '["synthetic-policy",42]', '["synthetic-policy","*"]', '[" synthetic-policy"]', '["seat-manager:license:synthetic-policy:state"]', '["synthetic-polic"]']) {
    assert.equal(automaticSpaceAllowed({ SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: value }, key), false, String(value));
  }
  assert.equal(automaticSpaceAllowed({ SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: '["synthetic-policy"]' }, key), true);
  assert.equal(automaticSpaceAllowed({ SYNC_AUTOMATIC_ENABLED: "false", SYNC_AUTOMATIC_SPACES: '["synthetic-policy"]' }, key), false);
  assert.equal(automaticSpaceAllowed({ SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: '["synthetic-policy"]' }, "seat-manager:single-teacher:state"), false);
});
