import { TAG_CATALOG } from "./tagCatalog";
import type { AppStudent, ComplementRuleId, SeatSettings, StudentId } from "./types";
import {
  areSeatIndicesInSameGroup,
  areSeatIndicesNeighbors,
  getFrontSeatIndices,
  getNeighborIndexPairs,
  getSeatPositionLabel as getLayoutSeatPositionLabel,
  resolveSeatLayout,
} from "./seatLayout";

export type SeatOrder = Array<StudentId | null>;

export interface SeatRequiredDetail {
  type: "安排同桌" | "避免同桌" | "前排照顾";
  label: string;
  satisfied: boolean;
  studentIds: StudentId[];
  seats: string[];
  currentRow?: number;
  frontRows?: number;
}

export interface SeatGenderDetail {
  leftId: StudentId;
  rightId: StudentId;
  leftName: string;
  rightName: string;
  leftSeat: string;
  rightSeat: string;
  leftGender: string;
  rightGender: string;
}

export interface SeatComplementMatch {
  ruleId: ComplementRuleId;
  ruleLabel: string;
  reason: string;
}

export interface SeatComplementDetail {
  leftId: StudentId;
  rightId: StudentId;
  leftName: string;
  rightName: string;
  leftSeat: string;
  rightSeat: string;
  matches: SeatComplementMatch[];
}

export interface SeatEvaluation {
  hardViolations: number;
  softPenalty: number;
  complementMatchedCount: number;
  complementEnabled: boolean;
  issues: string[];
  details: {
    required: SeatRequiredDetail[];
    gender: {
      mixed: SeatGenderDetail[];
      same: SeatGenderDetail[];
      unknown: SeatGenderDetail[];
    };
    complement: SeatComplementDetail[];
    front: SeatRequiredDetail[];
  };
}

export interface SeatPreviewStats {
  changedCount: number;
  occupiedPairs: number;
  mixedGenderPairs: number;
  sameGenderPairs: number;
  unknownGenderPairs: number;
  complementEnabled: boolean;
  complementMatchedCount: number;
  frontSatisfied: number;
  frontTotal: number;
  requiredTotal: number;
  requiredSatisfied: number;
  hardViolations: number;
  softPenalty: number;
}

export interface ShuffleCandidate {
  order: SeatOrder;
  evaluation: SeatEvaluation;
}

export const COMPLEMENT_RULES: Array<{
  id: ComplementRuleId;
  label: string;
  leftTagId: string;
  rightTagId: string;
}> = [
  { id: "talk_quiet", label: "爱讲话 ↔ 沉默", leftTagId: "talkative", rightTagId: "quiet" },
  { id: "focus_balance", label: "容易分心 ↔ 专注", leftTagId: "distractible", rightTagId: "focused" },
  { id: "role_balance", label: "主动 ↔ 配合", leftTagId: "leader", rightTagId: "supporter" },
  { id: "cn_balance", label: "语文强 ↔ 语文弱", leftTagId: "cn_strong", rightTagId: "cn_weak" },
  { id: "math_balance", label: "数学强 ↔ 数学弱", leftTagId: "math_strong", rightTagId: "math_weak" },
  { id: "en_balance", label: "英语强 ↔ 英语弱", leftTagId: "en_strong", rightTagId: "en_weak" },
];

const tagIdByLabel = new Map(TAG_CATALOG.map(tag => [tag.label, tag.id]));

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getDeskPairsForSeatCount(seatCount: number, settings?: SeatSettings): Array<[number, number]> {
  return getNeighborIndexPairs(resolveSeatLayout(settings?.layout, seatCount));
}

function matchPairScope(indexA: number, indexB: number, settings: SeatSettings, scope: "neighbor" | "group" = "neighbor"): boolean {
  if (indexA < 0 || indexB < 0) {
    return false;
  }
  const layout = resolveSeatLayout(settings.layout, Math.max(indexA, indexB) + 1);
  return scope === "group" ? areSeatIndicesInSameGroup(layout, indexA, indexB) : areSeatIndicesNeighbors(layout, indexA, indexB);
}

export function getSeatPositionLabel(index: number, settings?: SeatSettings, seatCount = index + 1): string {
  if (index < 0) {
    return "未入座";
  }
  if (!settings?.layout) return `第${Math.floor(index / 8) + 1}排第${(index % 8) + 1}列`;
  return getLayoutSeatPositionLabel(resolveSeatLayout(settings.layout, seatCount), index);
}

export function getChangedSeatIndices(before: SeatOrder, after: SeatOrder): number[] {
  const total = Math.max(before.length, after.length);
  const changed: number[] = [];
  for (let index = 0; index < total; index += 1) {
    if ((before[index] ?? null) !== (after[index] ?? null)) {
      changed.push(index);
    }
  }
  return changed;
}

function getEffectiveTagIds(student?: AppStudent): Set<string> {
  const ids = new Set<string>();
  if (!student) {
    return ids;
  }
  [...student.manualTagIds, ...student.autoTagIds].forEach(id => ids.add(id));
  [...student.tags, ...student.academicTags].forEach(label => {
    const id = tagIdByLabel.get(label);
    if (id) {
      ids.add(id);
    }
  });
  return ids;
}

function getComplementMatches(student: AppStudent | undefined, mate: AppStudent | undefined, rules = COMPLEMENT_RULES): SeatComplementMatch[] {
  if (!student || !mate) {
    return [];
  }
  const tagsA = getEffectiveTagIds(student);
  const tagsB = getEffectiveTagIds(mate);
  return rules
    .filter(rule => {
      const direct = tagsA.has(rule.leftTagId) && tagsB.has(rule.rightTagId);
      const reverse = tagsA.has(rule.rightTagId) && tagsB.has(rule.leftTagId);
      return direct || reverse;
    })
    .map(rule => ({
      ruleId: rule.id,
      ruleLabel: rule.label,
      reason: rule.label.replace(" ↔ ", " + "),
    }));
}

function getActiveComplementRules(settings: SeatSettings) {
  const ids = new Set(settings.complementRuleIds);
  return COMPLEMENT_RULES.filter(rule => ids.has(rule.id));
}

function studentMaps(students: AppStudent[]) {
  return {
    byId: new Map(students.map(student => [student.id, student])),
    nameById: new Map(students.map(student => [student.id, student.name])),
    genderById: new Map(students.map(student => [student.id, (student.gender || "").trim()])),
  };
}

export function evaluateSeatOrder(students: AppStudent[], order: SeatOrder, settings: SeatSettings): SeatEvaluation {
  const issues: string[] = [];
  const { byId, nameById, genderById } = studentMaps(students);
  const activeComplementRules = getActiveComplementRules(settings);
  const required: SeatRequiredDetail[] = [];
  const front: SeatRequiredDetail[] = [];
  const gender = { mixed: [] as SeatGenderDetail[], same: [] as SeatGenderDetail[], unknown: [] as SeatGenderDetail[] };
  const complement: SeatComplementDetail[] = [];
  let softPenalty = 0;
  let complementMatchedCount = 0;

  const layout = resolveSeatLayout(settings.layout, order.length);
  getDeskPairsForSeatCount(order.length, settings).forEach(([left, right]) => {
    const leftId = order[left];
    const rightId = order[right];
    if (!leftId || !rightId) {
      return;
    }

    const leftGender = genderById.get(leftId) || "";
    const rightGender = genderById.get(rightId) || "";
    const genderItem = {
      leftId,
      rightId,
      leftName: nameById.get(leftId) || "未知",
      rightName: nameById.get(rightId) || "未知",
      leftSeat: getSeatPositionLabel(left, settings, order.length),
      rightSeat: getSeatPositionLabel(right, settings, order.length),
      leftGender: leftGender || "未知",
      rightGender: rightGender || "未知",
    };
    if (!leftGender || !rightGender) {
      gender.unknown.push(genderItem);
    } else if (leftGender === rightGender) {
      if (settings.pairByGender) {
        softPenalty += 1;
      }
      gender.same.push(genderItem);
    } else {
      gender.mixed.push(genderItem);
    }

    if (activeComplementRules.length) {
      const matches = getComplementMatches(byId.get(leftId), byId.get(rightId), activeComplementRules);
      if (matches.length) {
        complementMatchedCount += 1;
        complement.push({
          leftId,
          rightId,
          leftName: nameById.get(leftId) || "未知",
          rightName: nameById.get(rightId) || "未知",
          leftSeat: getSeatPositionLabel(left, settings, order.length),
          rightSeat: getSeatPositionLabel(right, settings, order.length),
          matches,
        });
      }
    }
  });

  settings.constraints.lockedDeskmatePairs.forEach(pair => {
    const leftIndex = order.indexOf(pair.a);
    const rightIndex = order.indexOf(pair.b);
    if (leftIndex === -1 || rightIndex === -1) {
      return;
    }
    const scope = pair.scope || "neighbor";
    const satisfied = matchPairScope(leftIndex, rightIndex, settings, scope);
    const detail = {
      type: "安排同桌" as const,
      label: `${nameById.get(pair.a) || "未知"} 和 ${nameById.get(pair.b) || "未知"} 安排${scope === "group" ? "同组" : "相邻"}`,
      satisfied,
      studentIds: [pair.a, pair.b],
      seats: [getSeatPositionLabel(leftIndex, settings, order.length), getSeatPositionLabel(rightIndex, settings, order.length)],
    };
    required.push(detail);
    if (!satisfied) {
      issues.push(`${nameById.get(pair.a) || "未知"} 和 ${nameById.get(pair.b) || "未知"} 没有安排成同桌`);
    }
  });

  settings.constraints.noDeskmatePairs.forEach(pair => {
    const leftIndex = order.indexOf(pair.a);
    const rightIndex = order.indexOf(pair.b);
    if (leftIndex === -1 || rightIndex === -1) {
      return;
    }
    const scope = pair.scope || "neighbor";
    const satisfied = !matchPairScope(leftIndex, rightIndex, settings, scope);
    const detail = {
      type: "避免同桌" as const,
      label: `${nameById.get(pair.a) || "未知"} 不和 ${nameById.get(pair.b) || "未知"} ${scope === "group" ? "同组" : "相邻"}`,
      satisfied,
      studentIds: [pair.a, pair.b],
      seats: [getSeatPositionLabel(leftIndex, settings, order.length), getSeatPositionLabel(rightIndex, settings, order.length)],
    };
    required.push(detail);
    if (!satisfied) {
      issues.push(`${nameById.get(pair.a) || "未知"} 和 ${nameById.get(pair.b) || "未知"} 仍然坐成了同桌`);
    }
  });

  const frontRows = Math.max(1, settings.constraints.frontRows || 2);
  const frontSeatIndices = getFrontSeatIndices(layout, frontRows);
  settings.constraints.frontRowStudentIds.forEach(studentId => {
    const seatIndex = order.indexOf(studentId);
    if (seatIndex === -1) {
      return;
    }
    const currentRow = frontSeatIndices.has(seatIndex) ? Math.min(frontRows, 1) : frontRows + 1;
    const satisfied = frontSeatIndices.has(seatIndex);
    const detail = {
      type: "前排照顾" as const,
      label: `${nameById.get(studentId) || "未知学生"} 坐前 ${frontRows} 排`,
      satisfied,
      studentIds: [studentId],
      seats: [getSeatPositionLabel(seatIndex, settings, order.length)],
      currentRow,
      frontRows,
    };
    required.push(detail);
    front.push(detail);
    if (!satisfied) {
      issues.push(`${nameById.get(studentId) || "未知学生"} 没有坐在前 ${frontRows} 排`);
    }
  });

  if (settings.groupBalanceMode === "neighbor-and-group") {
    layout.groups.forEach(group => {
      const memberIds = group.seatIds.map(seatId => layout.seats.findIndex(seat => seat.id === seatId)).map(index => order[index]).filter((id): id is StudentId => Boolean(id));
      const knownGenders = memberIds.map(id => genderById.get(id) || "").filter(Boolean);
      if (knownGenders.length > 1) {
        const counts = new Map<string, number>(); knownGenders.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
        softPenalty += Math.max(...counts.values()) - Math.min(...counts.values());
      }
      if (activeComplementRules.length) {
        for (let a = 0; a < memberIds.length; a += 1) for (let b = a + 1; b < memberIds.length; b += 1) {
          if (getComplementMatches(byId.get(memberIds[a]), byId.get(memberIds[b]), activeComplementRules).length) complementMatchedCount += 1;
        }
      }
    });
  }

  return {
    hardViolations: issues.length,
    softPenalty,
    complementMatchedCount,
    complementEnabled: activeComplementRules.length > 0,
    issues,
    details: { required, gender, complement, front },
  };
}

function generateCandidateOrderFromCurrent(seatOrder: SeatOrder, lockedSeats: Set<number>, settings: SeatSettings): SeatOrder {
  const total = seatOrder.length;
  const allowLockedEmptyFill = !settings.keepLockedEmpty;
  const fixedByIndex = new Map<number, StudentId | null>();
  const movableIndices: number[] = [];
  const movableStudents: StudentId[] = [];
  const movableSet = new Set<number>();

  for (let index = 0; index < total; index += 1) {
    const value = seatOrder[index] ?? null;
    const isLocked = lockedSeats.has(index);
    if (isLocked && !(allowLockedEmptyFill && !value)) {
      fixedByIndex.set(index, value);
      continue;
    }
    movableIndices.push(index);
    movableSet.add(index);
    if (value) {
      movableStudents.push(value);
    }
  }

  const next = [...seatOrder];
  const movableIds = new Set(movableStudents);
  const lockedPairs = settings.constraints.lockedDeskmatePairs.filter(pair => movableIds.has(pair.a) && movableIds.has(pair.b));
  const layout = resolveSeatLayout(settings.layout, total);
  const availableDeskPairs = getDeskPairsForSeatCount(total, settings).filter(([left, right]) => movableSet.has(left) && movableSet.has(right));
  const availableGroupPairs = layout.groups.flatMap(group => {
    const indices = group.seatIds.map(id => layout.seats.findIndex(seat => seat.id === id)).filter(index => movableSet.has(index));
    const pairs: Array<[number, number]> = [];
    for (let a = 0; a < indices.length; a += 1) for (let b = a + 1; b < indices.length; b += 1) pairs.push([indices[a], indices[b]]);
    return pairs;
  });
  shuffleArray(availableDeskPairs); shuffleArray(availableGroupPairs);

  const usedIds = new Set<StudentId>();
  const assignedIndices = new Set<number>();
  lockedPairs.forEach(pair => {
    if (usedIds.has(pair.a) || usedIds.has(pair.b)) {
      return;
    }
    const candidates = pair.scope === "group" ? availableGroupPairs : availableDeskPairs;
    const deskPair = candidates.find(([left, right]) => !assignedIndices.has(left) && !assignedIndices.has(right));
    if (!deskPair) {
      return;
    }
    const [leftIndex, rightIndex] = deskPair;
    if (Math.random() < 0.5) {
      next[leftIndex] = pair.a;
      next[rightIndex] = pair.b;
    } else {
      next[leftIndex] = pair.b;
      next[rightIndex] = pair.a;
    }
    assignedIndices.add(leftIndex);
    assignedIndices.add(rightIndex);
    usedIds.add(pair.a);
    usedIds.add(pair.b);
  });

  const remainStudents = movableStudents.filter(id => !usedIds.has(id));
  shuffleArray(remainStudents);
  let pointer = 0;
  [...movableIndices].sort((a, b) => a - b).forEach(index => {
    if (assignedIndices.has(index)) {
      return;
    }
    next[index] = pointer < remainStudents.length ? remainStudents[pointer] : null;
    pointer += 1;
  });

  fixedByIndex.forEach((value, index) => {
    next[index] = value;
  });
  return next;
}

export function buildBestShuffleCandidate(
  students: AppStudent[],
  seatOrder: SeatOrder,
  lockedSeats: Set<number>,
  settings: SeatSettings,
): ShuffleCandidate | null {
  const retries = Math.max(50, settings.constraints.maxRetries || 200);
  const complementEnabled = getActiveComplementRules(settings).length > 0;
  let bestOrder: SeatOrder | null = null;
  let bestEvaluation: SeatEvaluation | null = null;

  for (let i = 0; i < retries; i += 1) {
    const order = generateCandidateOrderFromCurrent(seatOrder, lockedSeats, settings);
    const evaluation = evaluateSeatOrder(students, order, settings);
    if (
      !bestEvaluation ||
      evaluation.hardViolations < bestEvaluation.hardViolations ||
      (evaluation.hardViolations === bestEvaluation.hardViolations && evaluation.softPenalty < bestEvaluation.softPenalty) ||
      (
        evaluation.hardViolations === bestEvaluation.hardViolations &&
        evaluation.softPenalty === bestEvaluation.softPenalty &&
        evaluation.complementMatchedCount > bestEvaluation.complementMatchedCount
      )
    ) {
      bestOrder = order;
      bestEvaluation = evaluation;
    }
    if (!complementEnabled && evaluation.hardViolations === 0 && evaluation.softPenalty === 0) {
      break;
    }
  }

  return bestOrder && bestEvaluation ? { order: bestOrder, evaluation: bestEvaluation } : null;
}

export function getSeatPreviewStats(students: AppStudent[], currentOrder: SeatOrder, order: SeatOrder, evaluation: SeatEvaluation, settings: SeatSettings): SeatPreviewStats {
  const studentById = new Map(students.map(student => [student.id, student]));
  let occupiedPairs = 0;
  let mixedGenderPairs = 0;

  getDeskPairsForSeatCount(order.length, settings).forEach(([left, right]) => {
    const leftStudent = order[left] ? studentById.get(order[left] as StudentId) : null;
    const rightStudent = order[right] ? studentById.get(order[right] as StudentId) : null;
    if (!leftStudent || !rightStudent) {
      return;
    }
    occupiedPairs += 1;
    if (leftStudent.gender && rightStudent.gender && leftStudent.gender !== rightStudent.gender) {
      mixedGenderPairs += 1;
    }
  });

  const frontRows = Math.max(1, settings.constraints.frontRows || 2);
  const frontIndices = getFrontSeatIndices(resolveSeatLayout(settings.layout, order.length), frontRows);
  const frontTotal = settings.constraints.frontRowStudentIds.length;
  const frontSatisfied = settings.constraints.frontRowStudentIds.filter(id => {
    const index = order.indexOf(id);
    return index >= 0 && frontIndices.has(index);
  }).length;
  const requiredTotal =
    settings.constraints.lockedDeskmatePairs.length +
    settings.constraints.noDeskmatePairs.length +
    frontTotal;
  const hardViolations = evaluation.hardViolations;

  return {
    changedCount: getChangedSeatIndices(currentOrder, order).length,
    occupiedPairs,
    mixedGenderPairs,
    sameGenderPairs: evaluation.details.gender.same.length,
    unknownGenderPairs: evaluation.details.gender.unknown.length,
    complementEnabled: evaluation.complementEnabled,
    complementMatchedCount: evaluation.complementMatchedCount,
    frontSatisfied,
    frontTotal,
    requiredTotal,
    requiredSatisfied: Math.max(0, requiredTotal - hardViolations),
    hardViolations,
    softPenalty: evaluation.softPenalty,
  };
}
