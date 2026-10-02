import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// These jobs and steps form the validation contract of pages.yml. A successful
// run alone is insufficient: GitHub can also report success with skipped jobs.
const requiredJobs = new Map([
  ["validate", ["Validate React frontend"]],
  ["zhang-e2e (1)", ["Validate Zhang in Chromium", "Check Zhang bundle size", "Upload Pages artifact"]],
  ["zhang-e2e (2)", ["Validate Zhang in Chromium"]],
  ["commercial-e2e", ["Validate Commercial in Chromium"]],
  ["deploy", ["Deploy to GitHub Pages"]],
]);
const contractStep = "Validate release verification contract v2";
const modeContractStep = "Validate release verification contract v3";
const modeBuildStep = enabled => `Build Zhang release with automatic sync ${enabled ? "enabled" : "disabled"}`;
const succeeded = value => value?.status === "completed" && value.conclusion === "success";

export async function verifyZhangRelease({ repository, sha, token, automaticSyncRelease = false, apiUrl = "https://api.github.com" }, request = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[0-9a-f]{40}$/.test(sha || "")) {
    throw new Error("A repository and a full lowercase 40-character commit SHA are required.");
  }
  if (!token) throw new Error("An Actions read token is required to verify Zhang evidence.");
  if (typeof automaticSyncRelease !== "boolean") throw new Error("automaticSyncRelease must be a boolean.");
  const base = `${apiUrl}/repos/${repository}/actions`;
  async function list(path, field) {
    const items = [];
    for (let page = 1; page <= 10; page++) {
      const response = await request(`${base}/${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Cannot verify Zhang evidence: GitHub API returned ${response.status}.`);
      const batch = (await response.json())[field];
      if (!Array.isArray(batch)) throw new Error("GitHub returned invalid validation evidence.");
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error("Too many validation records; refusing to use incomplete evidence.");
  }
  const runs = await list(`workflows/pages.yml/runs?head_sha=${sha}&branch=main&status=success`, "workflow_runs");
  for (const run of runs) {
    if (!succeeded(run) || run.head_sha !== sha || run.head_branch !== "main"
      || run.path !== ".github/workflows/pages.yml" || !["push", "workflow_dispatch"].includes(run.event)
      || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) continue;
    // Inspect the successful attempt, never combine jobs from separate reruns.
    const jobs = await list(`runs/${run.id}/attempts/${run.run_attempt}/jobs`, "jobs");
    const complete = [...requiredJobs].every(([name, steps]) => {
      const matching = jobs.filter(job => job.name === name);
      return matching.length === 1 && succeeded(matching[0])
        && steps.every(step => matching[0].steps?.some(item => item.name === step && succeeded(item)));
    });
    if (!complete) continue;
    const validation = jobs.find(job => job.name === "validate");
    const zhang = jobs.find(job => job.name === "zhang-e2e (1)");
    const modeContract = validation.steps.some(step => step.name === modeContractStep);
    let artifact;
    if (modeContract || zhang.steps.some(step => [modeBuildStep(true), modeBuildStep(false)].includes(step.name))) {
      // Mode and attempt are part of the actual uploaded/deployed artifact name.
      // A skipped v3 marker cannot fall back to legacy evidence.
      if (!validation.steps.some(step => step.name === modeContractStep && succeeded(step))
        || (automaticSyncRelease && run.event !== "workflow_dispatch")) continue;
      const selected = zhang.steps.filter(step => step.name === modeBuildStep(automaticSyncRelease));
      const other = zhang.steps.filter(step => step.name === modeBuildStep(!automaticSyncRelease));
      if (selected.length !== 1 || !succeeded(selected[0]) || other.length !== 1 || other[0].conclusion !== "skipped"
        || !zhang.steps.some(step => step.name === "Check Zhang production bundle" && succeeded(step))) continue;
      const name = `github-pages-auto-${automaticSyncRelease ? "on" : "off"}-${run.run_attempt}`;
      const artifacts = await list(`runs/${run.id}/artifacts?name=${name}`, "artifacts");
      const matching = artifacts.filter(item => item.name === name && typeof item.expired === "boolean" && item.workflow_run?.head_sha === sha && Number.isSafeInteger(item.id));
      if (matching.length !== 1 || (automaticSyncRelease && matching[0].expired)) continue;
      artifact = { id: matching[0].id, name, automaticSyncRelease, ...(matching[0].expired ? { expired: true } : {}) };
    } else if (automaticSyncRelease) continue;
    const reuse = (modeContract || validation.steps.some(step => step.name === contractStep && succeeded(step))) && !artifact?.expired;
    if (reuse && ![["zhang-e2e (1)", "Validate enabled Zhang sync in Chromium"], ["commercial-e2e", "Validate enabled Commercial sync in Chromium"]].every(([name, step]) => jobs.find(job => job.name === name).steps.some(item => item.name === step && succeeded(item)))) continue;
    return { runId: run.id, attempt: run.run_attempt, reuse, ...(artifact ? { artifact } : {}) };
  }
  throw new Error("No successful Zhang deployment with all required checks exists for this exact main commit.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = process.env.APPROVED_SYNC_AUTO_RELEASE || "false";
    if (!["true", "false"].includes(mode)) throw new Error("APPROVED_SYNC_AUTO_RELEASE must be true or false.");
    const result = await verifyZhangRelease({
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.APPROVED_SHA,
      token: process.env.GH_TOKEN,
      automaticSyncRelease: mode === "true",
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    });
    const output = `reuse_validation=${result.reuse}\nevidence_run_id=${result.runId}\nevidence_attempt=${result.attempt}\nartifact_auto_release=${mode}\n${result.artifact ? `evidence_artifact_id=${result.artifact.id}\nevidence_artifact_name=${result.artifact.name}\n` : ""}`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    console.log(`Verified Zhang run ${result.runId}, attempt ${result.attempt}; ${result.reuse ? "reuse shared validation" : "legacy evidence: run full validation"}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
