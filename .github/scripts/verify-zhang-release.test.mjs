import assert from "node:assert/strict";
import test from "node:test";
import { verifyZhangRelease } from "./verify-zhang-release.mjs";

const sha = "a".repeat(40);
const input = { repository: "owner/project", sha, token: "test-only" };
const success = { status: "completed", conclusion: "success" };
const step = name => ({ name, ...success });
const job = (name, steps) => ({ name, ...success, steps: steps.map(step) });
function fixture() {
  return {
    run: { ...success, id: 42, run_attempt: 2, head_sha: sha, head_branch: "main", path: ".github/workflows/pages.yml", event: "push" },
    jobs: [
      job("validate", ["Validate React frontend", "Validate release verification contract v1"]),
      job("zhang-e2e (1)", ["Validate Zhang in Chromium", "Check Zhang bundle size", "Upload Pages artifact"]),
      job("zhang-e2e (2)", ["Validate Zhang in Chromium"]),
      job("commercial-e2e", ["Validate Commercial in Chromium"]),
      job("deploy", ["Deploy to GitHub Pages"]),
    ],
  };
}
function api(data) {
  return async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/runs")) {
      assert.equal(parsed.searchParams.get("head_sha"), sha);
      assert.equal(parsed.searchParams.get("branch"), "main");
      return { ok: true, json: async () => ({ workflow_runs: [data.run] }) };
    }
    assert.equal(parsed.pathname, "/repos/owner/project/actions/runs/42/attempts/2/jobs");
    return { ok: true, json: async () => ({ jobs: data.jobs }) };
  };
}

test("reuses only complete exact-SHA evidence from the successful attempt", async () => {
  assert.deepEqual(await verifyZhangRelease(input, api(fixture())), { runId: 42, attempt: 2, reuse: true });
});
test("old successful deployments remain eligible for rollback with full validation", async () => {
  const data = fixture();
  data.jobs[0].steps.pop();
  assert.equal((await verifyZhangRelease(input, api(data))).reuse, false);
});
for (const [field, value] of Object.entries({ head_sha: "b".repeat(40), head_branch: "feature", path: ".github/workflows/other.yml", event: "pull_request", conclusion: "failure", status: "in_progress" })) {
  test(`rejects unrelated or incomplete run: ${field}`, async () => {
    const data = fixture();
    data.run[field] = value;
    await assert.rejects(verifyZhangRelease(input, api(data)), /No successful Zhang/);
  });
}
for (const name of ["validate", "zhang-e2e (1)", "zhang-e2e (2)", "commercial-e2e", "deploy"]) {
  test(`rejects missing, skipped or failed required job: ${name}`, async () => {
    for (const conclusion of ["skipped", "failure", "cancelled", "missing"]) {
      const data = fixture();
      if (conclusion === "missing") data.jobs = data.jobs.filter(item => item.name !== name);
      else data.jobs.find(item => item.name === name).conclusion = conclusion;
      await assert.rejects(verifyZhangRelease(input, api(data)), /No successful Zhang/);
    }
  });
}
test("a successful job cannot hide a skipped required step", async () => {
  const data = fixture();
  data.jobs[3].steps[0].conclusion = "skipped";
  await assert.rejects(verifyZhangRelease(input, api(data)), /No successful Zhang/);
});
test("missing contract marker success forces full validation", async () => {
  const data = fixture();
  data.jobs[0].steps[1].conclusion = "skipped";
  assert.equal((await verifyZhangRelease(input, api(data))).reuse, false);
});
test("API errors fail closed instead of silently allowing deployment", async () => {
  await assert.rejects(verifyZhangRelease(input, async () => ({ ok: false, status: 403 })), /403/);
});
test("invalid input is rejected before contacting GitHub", async () => {
  const request = () => assert.fail("must not request");
  await assert.rejects(verifyZhangRelease({ ...input, sha: "main" }, request), /40-character/);
  await assert.rejects(verifyZhangRelease({ ...input, token: "" }, request), /token/);
});
