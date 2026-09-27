import { describe, expect, it } from "vitest";
import {
  buildScoreHistogram,
  countBands,
  getBandKey,
  getExamFullScores,
  getExamTotalFullScore,
  getRankTierLines,
  getScoreBandLines,
  inferFullScore,
  normalizeFullScores,
  pickHistogramBinWidth,
  resolveThresholdRates,
} from "./gradeBands";
import type { GradeExam } from "./types";

function exam(scores: Record<string, number[]>, fullScores?: Record<string, number>): GradeExam {
  const subjects = Object.keys(scores);
  const count = Math.max(...Object.values(scores).map(values => values.length));
  return {
    id: "e1",
    name: "期中",
    date: "2026-09-27",
    subjects,
    fullScores,
    rows: Array.from({ length: count }, (_, index) => ({
      id: `r${index}`,
      name: `学生${index}`,
      scores: Object.fromEntries(subjects.map(subject => [subject, { score: scores[subject][index] ?? null }])),
      total: null,
    })),
  };
}

describe("grade full scores", () => {
  it("infers 100/150 point subjects from the exam maximum and prefers teacher-confirmed values", () => {
    expect(inferFullScore(null)).toBe(100);
    expect(inferFullScore(98)).toBe(100);
    expect(inferFullScore(131)).toBe(150);
    expect(inferFullScore(268)).toBe(300);
    const sample = exam({ 语文: [120, 98], 地理: [88, 70], 英语: [95, 60] }, { 英语: 120 });
    expect(getExamFullScores(sample)).toEqual({ 语文: 150, 地理: 100, 英语: 120 });
    expect(getExamTotalFullScore(sample)).toBe(370);
  });

  it("drops invalid persisted full scores", () => {
    expect(normalizeFullScores({ 语文: 150, 数学: 0, 英语: "120", "": 100 })).toEqual({ 语文: 150 });
    expect(normalizeFullScores([150])).toBeUndefined();
    expect(normalizeFullScores({ 数学: -1 })).toBeUndefined();
  });
});

describe("grade band lines", () => {
  it("converts score-rate thresholds into per-metric score lines and honours an independent total", () => {
    const thresholds = { pass: 60, good: 75, excellent: 90, total: { pass: 50, good: 70, excellent: 85 } };
    expect(getScoreBandLines(resolveThresholdRates(thresholds, "subject"), 150)).toEqual({ pass: 90, good: 112.5, excellent: 135 });
    expect(getScoreBandLines(resolveThresholdRates(thresholds, "total"), 600)).toEqual({ pass: 300, good: 420, excellent: 510 });
    expect(resolveThresholdRates({ pass: 60, good: 75, excellent: 90 }, "total")).toEqual({ pass: 60, good: 75, excellent: 90 });
  });

  it("classifies boundaries as belonging to the higher band and counts missing scores separately", () => {
    const lines = { pass: 90, good: 112.5, excellent: 135 };
    expect(getBandKey(135, lines)).toBe("excellent");
    expect(getBandKey(112.4, lines)).toBe("pass");
    expect(getBandKey(null, lines)).toBeNull();
    expect(countBands([140, 120, 95, 30, null], lines)).toEqual({ excellent: 1, good: 1, pass: 1, fail: 1, missing: 1 });
  });

  it("derives rank tiers from the top 10%, top 30% and bottom 20%, keeping tied scores together", () => {
    const values = Array.from({ length: 20 }, (_, index) => 100 - index);
    expect(getRankTierLines(values)).toEqual({ excellent: 99, good: 95, pass: 85 });
    const tied = [90, 90, 90, 80, 70, 60, 60, 50, 40, 30];
    const lines = getRankTierLines(tied)!;
    expect(countBands(tied, lines)).toMatchObject({ excellent: 3, good: 0, pass: 5, fail: 2 });
    expect(getRankTierLines([])).toBeNull();
  });
});

describe("score histogram", () => {
  it("uses about twenty bins scaled to the full score", () => {
    expect(pickHistogramBinWidth(100)).toBe(5);
    expect(pickHistogramBinWidth(150)).toBe(10);
    expect(pickHistogramBinWidth(600)).toBe(50);
  });

  it("splits bins at band lines so each bar belongs to exactly one band and every score is counted once", () => {
    const values = [70, 76, 78, 80, 82, 84, 86, 88, 89, 91, 100];
    const lines = { pass: 60, good: 75, excellent: 90 };
    const bins = buildScoreHistogram(values, 100, lines);
    expect(bins[0]).toMatchObject({ from: 70, to: 75, band: "pass", count: 1 });
    expect(bins[bins.length - 1]).toMatchObject({ from: 95, to: 100, inclusiveEnd: true, band: "excellent", count: 1 });
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(values.length);
    expect(bins.filter(bin => bin.band === "good").reduce((sum, bin) => sum + bin.count, 0)).toBe(8);

    const oneFifty = buildScoreHistogram([100, 111, 113, 134, 136, 150], 150, { pass: 90, good: 112.5, excellent: 135 });
    expect(oneFifty.map(bin => bin.from)).toEqual([100, 110, 112.5, 120, 130, 135, 140]);
    expect(oneFifty.find(bin => bin.from === 112.5)).toMatchObject({ to: 120, band: "good", count: 1 });
    expect(oneFifty.find(bin => bin.from === 130)).toMatchObject({ to: 135, band: "good", count: 1 });
  });

  it("keeps one bar structure for both band modes when the other mode's lines are passed as extra edges", () => {
    const values = [41, 52, 58, 63, 67, 71, 77, 83, 88, 94];
    const scoreLines = { pass: 60, good: 75, excellent: 90 };
    const rankLines = getRankTierLines(values)!;
    const extra = [scoreLines, rankLines].flatMap(lines => [lines.pass, lines.good, lines.excellent]);
    const byScore = buildScoreHistogram(values, 100, scoreLines, extra);
    const byRank = buildScoreHistogram(values, 100, rankLines, extra);
    expect(byRank.map(bin => [bin.from, bin.to, bin.count])).toEqual(byScore.map(bin => [bin.from, bin.to, bin.count]));
    expect(byRank.map(bin => bin.band)).not.toEqual(byScore.map(bin => bin.band));
  });

  it("returns no bins without scores", () => {
    expect(buildScoreHistogram([], 100, { pass: 60, good: 75, excellent: 90 })).toEqual([]);
  });
});
