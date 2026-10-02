import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      job("validate", ["Validate React frontend", "Validate release verification contract v2"]),
      job("zhang-e2e (1)", ["Validate Zhang in Chromium", "Check Zhang bundle size", "Upload Pages artifact", "Validate enabled Zhang sync in Chromium"]),
      job("zhang-e2e (2)", ["Validate Zhang in Chromium"]),
      job("commercial-e2e", ["Validate Commercial in Chromium", "Validate enabled Commercial sync in Chromium"]),
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


test("v2 evidence includes successful enabled sync checks from both editions", async () => {
  for (const name of ["Validate enabled Zhang sync in Chromium", "Validate enabled Commercial sync in Chromium"]) {
    const data = fixture(); data.jobs.flatMap(job => job.steps).find(step => step.name === name).conclusion = "skipped";
    await assert.rejects(verifyZhangRelease(input, api(data)), /No successful Zhang/);
  }
});
test("the old v1 contract cannot skip new enabled sync acceptance", async () => {
  const data = fixture(); data.jobs[0].steps[1].name = "Validate release verification contract v1";
  assert.equal((await verifyZhangRelease(input, api(data))).reuse, false);
});

function modeFixture(enabled) {
  const data = fixture();
  data.mode = enabled;
  data.run.event = "workflow_dispatch";
  data.jobs[0].steps[1].name = "Validate release verification contract v3";
  data.jobs[1].steps.push(
    { name: "Build Zhang release with automatic sync disabled", status: "completed", conclusion: enabled ? "skipped" : "success" },
    { name: "Build Zhang release with automatic sync enabled", status: "completed", conclusion: enabled ? "success" : "skipped" },
    step("Check Zhang production bundle"),
  );
  data.artifacts = [{ id: 17, name: `github-pages-auto-${enabled ? "on" : "off"}-2`, expired: false, workflow_run: { head_sha: sha } }];
  return data;
}
function modeApi(data) {
  const legacy = api(data);
  return async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith("/artifacts")) return legacy(url);
    assert.equal(parsed.pathname, "/repos/owner/project/actions/runs/42/artifacts");
    assert.equal(parsed.searchParams.get("name"), `github-pages-auto-${data.mode ? "on" : "off"}-2`);
    return { ok: true, json: async () => ({ artifacts: data.artifacts }) };
  };
}
test("v3 identifies the selected artifact mode and successful attempt", async () => {
  for (const enabled of [false, true]) {
    const data = modeFixture(enabled);
    assert.deepEqual(await verifyZhangRelease({ ...input, automaticSyncRelease: enabled }, modeApi(data)), {
      runId: 42, attempt: 2, reuse: true,
      artifact: { id: 17, name: `github-pages-auto-${enabled ? "on" : "off"}-2`, automaticSyncRelease: enabled },
    });
  }
});
test("closed evidence cannot satisfy an open request, and open evidence cannot satisfy the default closed request", async () => {
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(modeFixture(false))), /No successful Zhang/);
  await assert.rejects(verifyZhangRelease(input, modeApi(modeFixture(true))), /No successful Zhang/);
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, api(fixture())), /No successful Zhang/);
});
test("an automatic artifact requires explicit manual dispatch", async () => {
  const data = modeFixture(true); data.run.event = "push";
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(data)), /No successful Zhang/);
});
test("expired closed artifact metadata retains the original full-validation rollback path", async () => {
  const data = modeFixture(false); data.artifacts[0].expired = true;
  const result = await verifyZhangRelease(input, modeApi(data));
  assert.equal(result.reuse, false);
  assert.equal(result.artifact.automaticSyncRelease, false);
  assert.equal(result.artifact.expired, true);
});
test("v3 rejects missing, expired, duplicate, wrong-SHA and wrong-attempt artifact identities", async () => {
  for (const change of [
    data => { data.artifacts = []; },
    data => { data.artifacts[0].expired = true; },
    data => { data.artifacts.push({ ...data.artifacts[0] }); },
    data => { data.artifacts[0].workflow_run.head_sha = "b".repeat(40); },
    data => { data.artifacts[0].name = "github-pages-auto-on-1"; },
    data => { data.artifacts[0].name = "github-pages-auto-off-2"; },
  ]) {
    const data = modeFixture(true); change(data);
    await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(data)), /No successful Zhang/);
  }
});
test("v3 cannot hide a skipped mode build, production guard or contract marker", async () => {
  for (const name of ["Build Zhang release with automatic sync enabled", "Check Zhang production bundle", "Validate release verification contract v3"]) {
    const data = modeFixture(true); data.jobs.flatMap(job => job.steps).find(step => step.name === name).conclusion = "skipped";
    await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(data)), /No successful Zhang/);
  }
  const data = modeFixture(true);
  data.jobs[1].steps.find(step => step.name === "Build Zhang release with automatic sync disabled").conclusion = "success";
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(data)), /No successful Zhang/);
});
test("v3 retains both enabled-sync checks and fails closed on artifact API errors", async () => {
  for (const name of ["Validate enabled Zhang sync in Chromium", "Validate enabled Commercial sync in Chromium"]) {
    const data = modeFixture(true); data.jobs.flatMap(job => job.steps).find(step => step.name === name).conclusion = "skipped";
    await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, modeApi(data)), /No successful Zhang/);
  }
  const data = modeFixture(true); const request = modeApi(data);
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: true }, url => new URL(url).pathname.endsWith("/artifacts") ? { ok: false, status: 403 } : request(url)), /403/);
});
test("mode input rejects strings before contacting GitHub", async () => {
  await assert.rejects(verifyZhangRelease({ ...input, automaticSyncRelease: "false" }, () => assert.fail("must not request")), /boolean/);
});
test("the workflow builds the mode-specific production artifact and uses that identity for deployment", () => {
  const workflow = readFileSync(new URL("../workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /sync_auto_release:\s+description:.*\n\s+type: boolean\s+required: false\s+default: false/);
  const identity = "github-pages-auto-${{ github.event_name == 'workflow_dispatch' && inputs.sync_auto_release && 'on' || 'off' }}-${{ github.run_attempt }}";
  assert.ok(workflow.includes(`name: ${identity}`));
  assert.ok(workflow.includes(`artifact_name: ${identity}`));
  assert.equal((workflow.match(/VITE_SYNC_AUTO_RELEASE:/g) || []).length, 2);
  assert.match(workflow, /Build Zhang release with automatic sync disabled\n\s+if: matrix.shard == 1 && !\(github.event_name == 'workflow_dispatch' && inputs.sync_auto_release\)/);
  assert.match(workflow, /Build Zhang release with automatic sync enabled\n\s+if: matrix.shard == 1 && github.event_name == 'workflow_dispatch' && inputs.sync_auto_release/);
  assert.ok(workflow.indexOf("Build Zhang release with automatic sync enabled") < workflow.indexOf("Check Zhang production bundle"));
  assert.ok(workflow.indexOf("Check Zhang production bundle") < workflow.indexOf("Check Zhang bundle size"));
  assert.ok(workflow.indexOf("Check Zhang bundle size") < workflow.indexOf("Upload Pages artifact"));
});
