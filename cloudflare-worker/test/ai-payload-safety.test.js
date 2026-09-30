import assert from "node:assert/strict";
import test from "node:test";
import worker from "../deepseek-ai-worker.js";
import { signToken } from "../worker-auth.js";
import { trimStudentFollowupPayload, trimAssistantContext, sanitizeWeeklyDraftResult, sanitizeScoreItemResult } from "../worker-ai-payload.js";

const context = { student: { name: "学生A" }, exams: [], tags: [], strengths: [], weaknesses: [] };
const materials = { criteriaSummary: [{ criterionId: "study", label: "学习习惯", values: ["认真订正", "主动提问"] }], customOptions: [{ criterionId: "habit", criterionLabel: "日常表现", label: "帮助同学" }] };

test("nullable numeric evidence preserves missing values and real zero across every followup field", () => {
  for (const value of [null, undefined, "", "  ", "bad", Infinity, {}, false, 0, "0", 12]) {
    const expected = [0, "0", 12].includes(value) ? Number(value) : null;
    const trimmed = trimStudentFollowupPayload({ context: { ...context, latestExam: { totalScore: value, classRank: value, subjects: [{ subject: "数学", score: value }] }, trend: { totalScoreChange: value, classRankChange: value, changedSubjects: [{ subject: "数学", diff: value }] } } }).context;
    assert.deepEqual([trimmed.latestExam.totalScore, trimmed.latestExam.classRank, trimmed.latestExam.subjects[0].score, trimmed.trend.totalScoreChange, trimmed.trend.classRankChange, trimmed.trend.changedSubjects[0].diff], Array(6).fill(expected));
    const assistant = trimAssistantContext({ latestExam: { averageTotal: value }, focusStudents: [{ name: "学生A", latestTotal: value }], contextPacks: [{ title: "学生", items: [{ latestTotal: value, previousTotal: value, trend: value }] }], comparisonContext: { comparisonPacks: [{ title: "比较", items: [{ trend: value }] }] } });
    const item = assistant.contextPacks[0].items[0];
    assert.deepEqual([assistant.baseContext.latestExam.averageTotal, assistant.baseContext.focusStudents[0].latestTotal, item.latestTotal, item.previousTotal, item.trend, assistant.comparisonContext.comparisonPacks[0].items[0].trend], Array(6).fill(expected));
  }
});

test("followup materials keep structured labels and selected values", () => {
  const trimmed = trimStudentFollowupPayload({ context: { ...context, commentProfile: materials } });
  assert.deepEqual(trimmed.context.commentProfile.criteriaSummary, materials.criteriaSummary);
  assert.deepEqual(trimmed.context.commentProfile.customOptions, materials.customOptions);
  assert.equal(JSON.stringify(trimmed).includes("[object Object]"), false);
});

test("weekly draft output uses its own 6000 character bound", () => {
  for (const length of [801, 1200, 6000, 6001]) assert.equal(sanitizeWeeklyDraftResult({ content: "甲".repeat(length) }).content.length, Math.min(length, 6000));
  assert.equal(sanitizeWeeklyDraftResult({ content: { bad: "shape" } }).content, "");
  for (const length of [801, 1200, 1600, 1601]) assert.equal(sanitizeScoreItemResult({ overview: "甲".repeat(length) }, { questions: [] }).overview.length, Math.min(length, 1600));
});

test("record-only and material-only comment requests reach the upstream; empty requests do not", async t => {
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    sent.push(JSON.parse(JSON.parse(init.body).messages[1].content));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ comment: "合成测试评语" }) } }] });
  });
  const token = await signToken({ scope: "ai-trend", exp: Date.now() + 60000 }, "test-token");
  const env = { TOKEN_SECRET: "test-token", DEEPSEEK_API_KEY: "test-only" };
  const call = c => worker.fetch(new Request("https://worker.test/generate-comment", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ studentId: "s1", style: "warm", context: c }) }), env);
  for (const extra of [{ records: ["课堂主动答题"] }, { commentProfile: materials }, { records: ["课堂主动答题"], commentProfile: materials }]) {
    const response = await call({ ...context, ...extra });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).comment, "合成测试评语");
  }
  assert.equal(sent.length, 3);
  for (const empty of [context, { ...context, records: [" "], commentProfile: { criteriaSummary: [{ label: "习惯", values: [] }], customOptions: [{}] } }]) {
    assert.equal((await (await call(empty)).json()).needsMoreInfo, true);
  }
  assert.equal(sent.length, 3);
});

test("followup endpoint sends missing numbers and teacher materials intact to the upstream", async t => {
  let sent;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    sent = JSON.parse(JSON.parse(init.body).messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "合成建议", actions: ["观察", "沟通", "跟进"] }) } }] });
  });
  const token = await signToken({ scope: "ai-trend", exp: Date.now() + 60000 }, "test-token");
  const response = await worker.fetch(new Request("https://worker.test/student-followup", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: "s1", context: { ...context, latestExam: { classRank: null, totalScore: 0 }, trend: { totalScoreChange: null, classRankChange: null }, commentProfile: materials } }),
  }), { TOKEN_SECRET: "test-token", DEEPSEEK_API_KEY: "test-only" });
  assert.equal(response.status, 200);
  assert.equal(sent.context.latestExam.totalScore, 0);
  assert.equal(sent.context.latestExam.classRank, null);
  assert.equal(sent.context.trend.totalScoreChange, null);
  assert.equal(sent.context.trend.classRankChange, null);
  assert.deepEqual(sent.context.commentProfile.criteriaSummary, materials.criteriaSummary);
  assert.deepEqual(sent.context.commentProfile.customOptions, materials.customOptions);
});
