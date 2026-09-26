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
const contractStep = "Validate release verification contract v1";
const succeeded = value => value?.status === "completed" && value.conclusion === "success";

export async function verifyZhangRelease({ repository, sha, token, apiUrl = "https://api.github.com" }, request = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[0-9a-f]{40}$/.test(sha || "")) {
    throw new Error("A repository and a full lowercase 40-character commit SHA are required.");
  }
  if (!token) throw new Error("An Actions read token is required to verify Zhang evidence.");
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
    const reuse = jobs.find(job => job.name === "validate").steps.some(step => step.name === contractStep && succeeded(step));
    return { runId: run.id, attempt: run.run_attempt, reuse };
  }
  throw new Error("No successful Zhang deployment with all required checks exists for this exact main commit.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyZhangRelease({
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.APPROVED_SHA,
      token: process.env.GH_TOKEN,
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    });
    const output = `reuse_validation=${result.reuse}\nevidence_run_id=${result.runId}\nevidence_attempt=${result.attempt}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    console.log(`Verified Zhang run ${result.runId}, attempt ${result.attempt}; ${result.reuse ? "reuse shared validation" : "legacy evidence: run full validation"}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
