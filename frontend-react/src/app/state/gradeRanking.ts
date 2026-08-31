import type { GradeRankConfig, GradeScoreCell, SavedGradeExamEntry, ScoreImportDraft } from "./types";

export const DEFAULT_GRADE_RANK_CONFIG: GradeRankConfig = {
  autoClassRank: true,
  scoreBasis: "effective",
};

function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 新数据优先使用赋分；没有赋分时使用原始分，旧数据继续使用 score。
 * score 仍作为兼容展示字段保留，因此这里显式读取两个新字段，避免丢失来源语义。
 */
export function getEffectiveGradeScore(cell?: GradeScoreCell): number | null {
  if (isFiniteScore(cell?.assignedScore)) return cell.assignedScore;
  if (isFiniteScore(cell?.rawScore)) return cell.rawScore;
  return isFiniteScore(cell?.score) ? cell.score : null;
}

export function getEffectiveEntryTotal(entry: SavedGradeExamEntry, subjects: string[]): number | null {
  const explicit = getEffectiveGradeScore(entry.total);
  if (explicit !== null) return explicit;
  const values = subjects.map(subject => getEffectiveGradeScore(entry.scores[subject])).filter(isFiniteScore);
  return subjects.length > 0 && values.length === subjects.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10
    : null;
}

function competitionRanks(values: Array<{ index: number; value: number }>): Map<number, number> {
  const sorted = [...values].sort((left, right) => right.value - left.value || left.index - right.index);
  const ranks = new Map<number, number>();
  let previousValue: number | null = null;
  let currentRank = 0;
  sorted.forEach((item, sortedIndex) => {
    if (previousValue === null || item.value !== previousValue) currentRank = sortedIndex + 1;
    ranks.set(item.index, currentRank);
    previousValue = item.value;
  });
  return ranks;
}

export function createCompetitionRankMap(values: Array<{ key: string; value: number | null | undefined }>): Map<string, number> {
  const indexed = values.flatMap((item, index) => isFiniteScore(item.value) ? [{ index, value: item.value }] : []);
  const ranks = competitionRanks(indexed);
  return new Map(indexed.flatMap(item => {
    const rank = ranks.get(item.index);
    return rank === undefined ? [] : [[values[item.index].key, rank] as const];
  }));
}

function buildRankMap(
  entries: SavedGradeExamEntry[],
  getScore: (entry: SavedGradeExamEntry) => number | null,
): Map<number, number> {
  return competitionRanks(entries.flatMap((entry, index) => {
    const value = getScore(entry);
    return value === null ? [] : [{ index, value }];
  }));
}

/** 补齐缺失班排；同分使用竞赛排名（1、1、3），已有班排和校排均不覆盖。 */
export function applyAutomaticClassRanks(draft: ScoreImportDraft): ScoreImportDraft {
  let entries = draft.entries.map(entry => ({
    ...entry,
    scores: Object.fromEntries(Object.entries(entry.scores).map(([subject, cell]) => [subject, { ...cell }])),
    total: { ...entry.total },
  }));

  draft.subjects.forEach(subject => {
    const ranks = buildRankMap(entries, entry => getEffectiveGradeScore(entry.scores[subject]));
    entries = entries.map((entry, index) => {
      const cell = entry.scores[subject] || { score: null };
      const calculated = ranks.get(index);
      if ((cell.rankClass !== null && cell.rankClass !== undefined) || calculated === undefined) return entry;
      return { ...entry, scores: { ...entry.scores, [subject]: { ...cell, rankClass: calculated } } };
    });
  });

  const totalRanks = buildRankMap(entries, entry => getEffectiveEntryTotal(entry, draft.subjects));
  entries = entries.map((entry, index) => {
    const calculated = totalRanks.get(index);
    if ((entry.total.rankClass !== null && entry.total.rankClass !== undefined) || calculated === undefined) return entry;
    return { ...entry, total: { ...entry.total, rankClass: calculated } };
  });

  return { ...draft, entries };
}

export function getMissingClassRankSummary(draft: ScoreImportDraft): {
  missingMetricCount: number;
  missingCellCount: number;
  rankableMetricCount: number;
} {
  const metrics = [
    ...draft.subjects.map(subject => ({
      values: draft.entries.map(entry => ({
        score: getEffectiveGradeScore(entry.scores[subject]),
        rank: entry.scores[subject]?.rankClass,
      })),
    })),
    {
      values: draft.entries.map(entry => ({
        score: getEffectiveEntryTotal(entry, draft.subjects),
        rank: entry.total?.rankClass,
      })),
    },
  ];
  let missingMetricCount = 0;
  let missingCellCount = 0;
  let rankableMetricCount = 0;
  metrics.forEach(metric => {
    const rankable = metric.values.filter(item => item.score !== null);
    if (!rankable.length) return;
    rankableMetricCount += 1;
    const missing = rankable.filter(item => item.rank === null || item.rank === undefined).length;
    if (missing) missingMetricCount += 1;
    missingCellCount += missing;
  });
  return { missingMetricCount, missingCellCount, rankableMetricCount };
}
