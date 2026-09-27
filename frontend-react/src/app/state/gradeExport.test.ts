import { describe, expect, it } from "vitest";
import { buildGradePrintPreviewHtml, getDefaultGradeExportOptions } from "./gradeExport";
import type { GradeExam } from "./types";

const exam: GradeExam = {
  id: "mid",
  name: "期中考",
  date: "2026-09-27",
  subjects: ["语文"],
  fullScores: { 语文: 150 },
  rows: [140, 120, 100, 80].map((score, index) => ({ id: `r${index}`, name: `学生${index}`, scores: { 语文: { score } }, total: score })),
};

function distributionRow(html: string, label: string): string[] {
  const section = html.slice(html.indexOf("分数段分布"));
  const row = section.split("<tr>").find(item => item.includes(`<td>${label}</td>`))!;
  return [...row.matchAll(/<td>([^<]*)<\/td>/g)].map(match => match[1]);
}

describe("grade export thresholds", () => {
  it("uses each exam's full scores and the teacher's current thresholds in exported band statistics", () => {
    const options = getDefaultGradeExportOptions([exam]);
    const defaults = distributionRow(buildGradePrintPreviewHtml([exam], [], options), "语文");
    expect(defaults.slice(3, 11)).toEqual(["1", "25%", "1", "25%", "1", "25%", "1", "25%"]);
    const lenient = distributionRow(buildGradePrintPreviewHtml([exam], [], options, { pass: 50, good: 60, excellent: 80, total: { pass: 50, good: 60, excellent: 90 } }), "语文");
    expect(lenient.slice(3, 11)).toEqual(["0", "0%", "1", "25%", "1", "25%", "2", "50%"]);
    const total = distributionRow(buildGradePrintPreviewHtml([exam], [], options, { pass: 50, good: 60, excellent: 80, total: { pass: 50, good: 60, excellent: 90 } }), "总分");
    expect(total.slice(9, 11)).toEqual(["1", "25%"]);
  });
});
