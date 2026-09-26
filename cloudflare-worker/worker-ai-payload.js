import { toText } from "./worker-input.js";

export function isValidTrendPayload(payload) {
  return (
    payload &&
    payload.student === "学生A" &&
    Array.isArray(payload.recentExams) &&
    payload.recentExams.length > 0 &&
    payload.recentExams.length <= 40
  );
}

export function isValidClassPayload(payload) {
  return (
    payload &&
    payload.className === "本班" &&
    Number.isInteger(payload.studentCount) &&
    Number.isInteger(payload.comparedStudentCount) &&
    Array.isArray(payload.focusCandidates) &&
    payload.focusCandidates.length > 0 &&
    payload.focusCandidates.length <= 30
  );
}

export function isValidAssistantPayload(payload) {
  const context = payload?.context;
  const baseContext = context?.baseContext && typeof context.baseContext === "object" ? context.baseContext : context;
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.messages) &&
    payload.messages.length > 0 &&
    payload.messages.length <= 20 &&
    payload.messages.every((message) => (
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0 &&
      message.content.length <= 2000
    )) &&
    context &&
    typeof context === "object" &&
    Number.isInteger(baseContext?.studentCount) &&
    baseContext.studentCount >= 0
  );
}

export function isValidScoreMappingPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.headers) &&
    payload.headers.length > 0 &&
    payload.headers.length <= 80 &&
    Array.isArray(payload.sampleRows) &&
    payload.sampleRows.length <= 80 &&
    Array.isArray(payload.knownSubjects)
  );
}

export function isValidRosterMappingPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.headers) &&
    payload.headers.length > 0 &&
    payload.headers.length <= 80 &&
    Array.isArray(payload.sampleRows) &&
    payload.sampleRows.length <= 80
  );
}

export function isValidStudentCommentPayload(payload) {
  const context = payload?.context;
  const student = context?.student;
  const length = getStudentCommentLengthSettings(payload);
  return (
    payload &&
    typeof payload === "object" &&
    Boolean(toText(payload.studentId)) &&
    ["warm", "formal", "brief"].includes(payload.style) &&
    Boolean(length) &&
    context &&
    typeof context === "object" &&
    student &&
    typeof student === "object" &&
    Boolean(toText(student.name)) &&
    Array.isArray(context.tags) &&
    context.tags.length <= 20 &&
    Array.isArray(context.strengths) &&
    Array.isArray(context.weaknesses)
  );
}

export function isValidCommentRefinementPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    toText(payload.studentId) &&
    ["polish", "specific", "shorten"].includes(payload.action) &&
    typeof payload.selectedText === "string" &&
    payload.selectedText.trim().length > 0 &&
    payload.selectedText.length <= 600 &&
    typeof payload.contextBefore === "string" &&
    payload.contextBefore.length <= 600 &&
    typeof payload.contextAfter === "string" &&
    payload.contextAfter.length <= 600
  );
}

export function isValidStudentFollowupPayload(payload) {
  const context = payload?.context;
  const student = context?.student;
  return (
    payload &&
    typeof payload === "object" &&
    Boolean(toText(payload.studentId)) &&
    context &&
    typeof context === "object" &&
    student &&
    typeof student === "object" &&
    Boolean(toText(student.name)) &&
    Array.isArray(context.exams) &&
    context.exams.length <= 40 &&
    Array.isArray(context.tags) &&
    context.tags.length <= 20 &&
    (!payload.seatContext || typeof payload.seatContext === "object")
  );
}

export function isValidWeeklyDraftPayload(payload) {
  return Boolean(payload && typeof payload === "object" && ["class", "student"].includes(payload.scope) && toText(payload.subjectName) && toText(payload.startDate) && toText(payload.endDate) && Array.isArray(payload.facts) && payload.facts.length > 0 && payload.facts.length <= 20 && payload.facts.every(item => typeof item === "string" && item.length <= 300) && typeof payload.localDraft === "string" && payload.localDraft.length <= 6000);
}

export function isValidScoreItemPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.exam && typeof payload.exam === "object" && toText(payload.exam.id) && Array.isArray(payload.questions) && payload.questions.length > 0 && payload.questions.length <= 100 && payload.questions.every(item => item && typeof item === "object" && toText(item.id) && Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number(item.rate) <= 100 && Array.isArray(item.weakStudentIds) && item.weakStudentIds.length <= 12));
}

export function getStudentCommentLengthSettings(payload) {
  const mode = toText(payload?.commentLengthMode || "standard");
  const customTarget = Math.round(Number(payload?.targetWordCount));
  if (mode === "short") {
    return { mode, instruction: "80 到 100 字", maxChars: 130 };
  }
  if (mode === "standard") {
    return { mode, instruction: "100 到 150 字", maxChars: 180 };
  }
  if (mode === "long") {
    return { mode, instruction: "150 到 200 字", maxChars: 230 };
  }
  if (mode === "custom" && Number.isFinite(customTarget) && customTarget >= 50 && customTarget <= 300) {
    return { mode, instruction: `约 ${customTarget} 字，允许上下浮动 15 字`, maxChars: Math.min(330, customTarget + 35) };
  }
  return null;
}

export function getStudentCommentMissingInfo(context) {
  const missing = [];
  if (!context?.latestExam) {
    missing.push("最近考试成绩");
  }
  if (!context?.trend || Number(context.trend.examCount) < 2) {
    missing.push("多次考试趋势");
  }
  if (!Array.isArray(context?.tags) || !context.tags.length) {
    missing.push("学生标签");
  }
  if (!toText(context?.teacherNote)) {
    missing.push("教师补充评价");
  }
  return missing;
}

export function parseModelJson(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

export function sanitizeAiResult(result) {
  return {
    overall: toText(result.overall),
    changes: toText(result.changes),
    suggestions: toText(result.suggestions),
    disclaimer: toText(result.disclaimer) || "AI 内容仅供参考，请结合实际课堂观察判断。"
  };
}

export function sanitizeClassAiResult(result) {
  return {
    overall: toText(result.overall),
    classChanges: toText(result.classChanges || result.changes),
    focusStudents: toText(result.focusStudents),
    suggestions: toText(result.suggestions),
    disclaimer: toText(result.disclaimer) || "AI 内容仅供参考，请结合实际课堂观察判断。"
  };
}

export function sanitizeAssistantResult(result) {
  const prompts = Array.isArray(result.suggestedPrompts)
    ? result.suggestedPrompts.map((item) => toAssistantPlainText(item, 120)).filter(Boolean).slice(0, 4)
    : [];
  return {
    message: toAssistantPlainText(result.message || result.answer || result.content, 2400),
    disclaimer: toAssistantPlainText(result.disclaimer, 200) || "AI 内容仅供教师参考，请结合实际课堂观察判断。",
    suggestedPrompts: prompts
  };
}

export function sanitizeStudentFollowupResult(result) {
  const toList = (value, limit) => {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/\n|；|;/)
        : [];
    return raw
      .map((item) => toAssistantPlainText(item, 180))
      .filter(Boolean)
      .slice(0, limit);
  };
  const actions = toList(result.actions, 3);
  return {
    summary: toAssistantPlainText(result.summary || result.overall, 360),
    riskSignals: toList(result.riskSignals || result.risks, 5),
    strengths: toList(result.strengths, 5),
    actions,
    parentMessageDraft: toAssistantPlainText(result.parentMessageDraft || result.parentMessage, 700),
    commentMaterials: toList(result.commentMaterials || result.materials, 6),
    disclaimer: toAssistantPlainText(result.disclaimer, 200) || "AI 跟进建议仅供教师参考，请结合课堂观察判断。"
  };
}

export function sanitizeWeeklyDraftResult(result) {
  const list = (value, max = 6) => Array.isArray(value) ? value.map(toText).filter(Boolean).slice(0, max) : [];
  return { title: toText(result.title).slice(0, 80) || "周报", content: toText(result.content).slice(0, 6000), highlights: list(result.highlights), cautions: list(result.cautions), disclaimer: toText(result.disclaimer).slice(0, 300) || "AI 内容仅供教师确认后使用。" };
}

export function sanitizeScoreItemResult(result, payload) {
  const list = (value, max = 8) => Array.isArray(value) ? value.map(toText).filter(Boolean).slice(0, max) : [];
  const allowedIds = new Set(payload.questions.flatMap(item => Array.isArray(item.weakStudentIds) ? item.weakStudentIds.map(toText) : []));
  const followupCandidates = Array.isArray(result.followupCandidates) ? result.followupCandidates.flatMap(item => {
    const studentId = toText(item?.studentId);
    return studentId && allowedIds.has(studentId) ? [{ studentId, reason: toText(item?.reason).slice(0, 240) || "题目分析建议跟进" }] : [];
  }).slice(0, 12) : [];
  return { overview: toText(result.overview).slice(0, 1600), weakPoints: list(result.weakPoints), teachingSuggestions: list(result.teachingSuggestions), followupCandidates, disclaimer: toText(result.disclaimer).slice(0, 300) || "AI 分析仅供教师参考。" };
}

export function sanitizeScoreMappingResult(result, payload) {
  const maxIndex = payload.headers.length - 1;
  const safeIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
  };
  const knownSubjects = new Set(payload.knownSubjects || []);
  const subjectMappings = Array.isArray(result.subjectMappings)
    ? result.subjectMappings
        .map((item) => ({
          subject: knownSubjects.has(item?.subject) ? item.subject : "",
          scoreCol: safeIndex(item?.scoreCol),
          rawScoreCol: safeIndex(item?.rawScoreCol),
          assignedScoreCol: safeIndex(item?.assignedScoreCol),
          rankClassCol: safeIndex(item?.rankClassCol),
          rankSchoolCol: safeIndex(item?.rankSchoolCol)
        }))
        .filter((item) => item.subject && [item.scoreCol, item.rawScoreCol, item.assignedScoreCol].some((index) => index !== -1))
        .slice(0, 12)
    : [];
  return {
    nameCol: safeIndex(result.nameCol),
    subjectMappings,
    totalMapping: {
      scoreCol: safeIndex(result.totalMapping?.scoreCol),
      rawScoreCol: safeIndex(result.totalMapping?.rawScoreCol),
      assignedScoreCol: safeIndex(result.totalMapping?.assignedScoreCol),
      rankClassCol: safeIndex(result.totalMapping?.rankClassCol),
      rankSchoolCol: safeIndex(result.totalMapping?.rankSchoolCol)
    },
    note: toText(result.note || result.reason || "AI 已生成映射建议")
  };
}

export function sanitizeRosterMappingResult(result, payload) {
  const maxIndex = payload.headers.length - 1;
  const safeIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
  };
  return {
    nameCol: safeIndex(result.nameCol),
    studentNoCol: safeIndex(result.studentNoCol),
    genderCol: safeIndex(result.genderCol),
    rowCol: safeIndex(result.rowCol),
    colCol: safeIndex(result.colCol),
    hasHeader: result.hasHeader !== false,
    note: toText(result.note || result.reason || "AI 已生成名单映射建议")
  };
}

export function sanitizeStudentCommentResult(result, fallbackMissingInfo = [], lengthSettings = null) {
  const rawComment = String(toText(result.comment) || "").replace(/\s+/g, "");
  const comment = rawComment.slice(0, lengthSettings?.maxChars || 180);
  const missingInfo = Array.isArray(result.missingInfo)
    ? result.missingInfo.map((item) => toText(item)).filter(Boolean).slice(0, 6)
    : fallbackMissingInfo;
  return {
    comment,
    needsMoreInfo: Boolean(result.needsMoreInfo) || !comment,
    missingInfo
  };
}

export function sanitizeCommentRefinementResult(result) {
  return String(result?.replacement || "")
    .replace(/^\s*[“\"']|[”\"']\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export function toAssistantText(value, limit = 800) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, limit);
}

function toAssistantPlainText(value, limit = 800) {
  return toAssistantText(value, limit)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimAssistantComparisonContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }
  const packs = Array.isArray(context.comparisonPacks)
    ? context.comparisonPacks.map((pack) => ({
        kind: ["class_term", "subject_term", "student_term", "candidate_students", "notice"].includes(pack?.kind) ? pack.kind : "notice",
        title: toAssistantText(pack?.title, 80),
        reason: toAssistantText(pack?.reason, 160),
        items: Array.isArray(pack?.items)
          ? pack.items.map((item) => ({
              name: toAssistantText(item?.name, 40),
              summary: toAssistantText(item?.summary, 220),
              current: toAssistantText(item?.current, 220),
              compare: toAssistantText(item?.compare, 220),
              trend: Number.isFinite(Number(item?.trend)) ? Number(item.trend) : null,
              subjects: Array.isArray(item?.subjects) ? item.subjects.map((value) => toAssistantText(value, 60)).filter(Boolean).slice(0, 10) : [],
              exams: Array.isArray(item?.exams) ? item.exams.map((value) => toAssistantText(value, 160)).filter(Boolean).slice(0, 12) : []
            })).slice(0, pack?.kind === "candidate_students" ? 30 : 8)
          : []
      })).filter((pack) => pack.title && pack.items.length).slice(0, 4)
    : [];
  return {
    currentScope: {
      className: toAssistantText(context.currentScope?.className, 80),
      termLabel: toAssistantText(context.currentScope?.termLabel, 80)
    },
    compareScope: context.compareScope && typeof context.compareScope === "object" ? {
      className: toAssistantText(context.compareScope.className, 80),
      termLabel: toAssistantText(context.compareScope.termLabel, 80)
    } : null,
    notice: toAssistantText(context.notice, 180),
    comparisonPacks: packs
  };
}

export function trimStudentFollowupPayload(payload) {
  const context = payload.context || {};
  const trimExam = (exam) => ({
    name: toAssistantText(exam?.name, 80),
    date: toAssistantText(exam?.date, 40),
    period: ["oldest", "middle", "latest"].includes(exam?.period) ? exam.period : "",
    totalScore: Number.isFinite(Number(exam?.totalScore)) ? Number(exam.totalScore) : null,
    classRank: Number.isFinite(Number(exam?.classRank)) ? Number(exam.classRank) : null,
    subjects: Array.isArray(exam?.subjects)
      ? exam.subjects.map((item) => ({
          subject: toAssistantText(item?.subject, 30),
          score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null
        })).filter((item) => item.subject).slice(0, 12)
      : [],
    zeroSubjects: Array.isArray(exam?.zeroSubjects) ? exam.zeroSubjects.map((item) => toAssistantText(item, 30)).filter(Boolean).slice(0, 8) : []
  });
  return {
    student: {
      name: toAssistantText(payload.studentName || context.student?.name || "学生", 40)
    },
    scenario: ["detail", "grade", "seat", "comment"].includes(payload.scenario) ? payload.scenario : "detail",
    context: {
      latestExam: context.latestExam ? trimExam(context.latestExam) : null,
      exams: Array.isArray(context.exams) ? context.exams.map(trimExam).slice(-12) : [],
      trend: {
        examCount: Number(context.trend?.examCount) || 0,
        totalScoreChange: Number.isFinite(Number(context.trend?.totalScoreChange)) ? Number(context.trend.totalScoreChange) : null,
        classRankChange: Number.isFinite(Number(context.trend?.classRankChange)) ? Number(context.trend.classRankChange) : null,
        changedSubjects: Array.isArray(context.trend?.changedSubjects)
          ? context.trend.changedSubjects.map((item) => ({
              subject: toAssistantText(item?.subject, 30),
              diff: Number.isFinite(Number(item?.diff)) ? Number(item.diff) : null
            })).filter((item) => item.subject).slice(0, 8)
          : [],
        summary: toAssistantText(context.trend?.summary, 260)
      },
      strengths: Array.isArray(context.strengths) ? context.strengths.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : [],
      weaknesses: Array.isArray(context.weaknesses) ? context.weaknesses.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : [],
      tags: Array.isArray(context.tags) ? context.tags.map((item) => toAssistantText(item, 60)).filter(Boolean).slice(0, 16) : [],
      records: Array.isArray(context.records) ? context.records.map((item) => toAssistantText(item, 160)).filter(Boolean).slice(0, 10) : [],
      dormitory: toAssistantText(context.dormitory, 160),
      commentProfile: {
        criteriaSummary: Array.isArray(context.commentProfile?.criteriaSummary) ? context.commentProfile.criteriaSummary.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
        customOptions: Array.isArray(context.commentProfile?.customOptions) ? context.commentProfile.customOptions.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
        teacherNote: toAssistantText(context.commentProfile?.teacherNote || payload.teacherNote, 240)
      }
    },
    seatContext: {
      seatLabel: toAssistantText(payload.seatContext?.seatLabel, 40),
      deskMateName: toAssistantText(payload.seatContext?.deskMateName, 40),
      nearbyNames: Array.isArray(payload.seatContext?.nearbyNames) ? payload.seatContext.nearbyNames.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : []
    },
    requirements: payload.requirements || {}
  };
}

export function trimAssistantContext(context) {
  const base = context?.baseContext && typeof context.baseContext === "object" ? context.baseContext : context;
  return {
    baseContext: {
      className: toAssistantText(base.className, 80),
      termLabel: toAssistantText(base.termLabel, 80),
      studentCount: Number(base.studentCount) || 0,
      seatCount: Number(base.seatCount) || 0,
      latestExam: base.latestExam && typeof base.latestExam === "object" ? {
        name: toAssistantText(base.latestExam.name, 80),
        date: toAssistantText(base.latestExam.date, 40),
        studentCount: Number(base.latestExam.studentCount) || 0,
        subjectCount: Number(base.latestExam.subjectCount) || 0,
        averageTotal: Number.isFinite(Number(base.latestExam.averageTotal)) ? Number(base.latestExam.averageTotal) : null
      } : null,
      examInsights: Array.isArray(base.examInsights) ? base.examInsights.map((item) => toAssistantText(item, 180)).filter(Boolean).slice(0, 8) : [],
      gradeTrend: Array.isArray(base.gradeTrend) ? base.gradeTrend.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
      focusStudents: Array.isArray(base.focusStudents)
        ? base.focusStudents.map((student) => ({
            name: toAssistantText(student?.name, 40),
            category: toAssistantText(student?.category, 40),
            latestTotal: Number.isFinite(Number(student?.latestTotal)) ? Number(student.latestTotal) : null,
            reasons: Array.isArray(student?.reasons) ? student.reasons.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 3) : [],
            tags: Array.isArray(student?.tags) ? student.tags.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : []
          })).filter((student) => student.name).slice(0, 14)
        : [],
      tagSummary: Array.isArray(base.tagSummary) ? base.tagSummary.map((item) => toAssistantText(item, 80)).filter(Boolean).slice(0, 10) : [],
      recordSummary: Array.isArray(base.recordSummary) ? base.recordSummary.map((item) => toAssistantText(item, 140)).filter(Boolean).slice(0, 8) : [],
      seatSummary: toAssistantText(base.seatSummary, 120),
      dormitorySummary: Array.isArray(base.dormitorySummary) ? base.dormitorySummary.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
      fundSummary: toAssistantText(base.fundSummary, 160)
    },
    contextPacks: Array.isArray(context?.contextPacks)
      ? context.contextPacks.map((pack) => ({
          kind: ["student", "candidate_students", "exam", "dormitory", "tag", "records", "fund"].includes(pack?.kind) ? pack.kind : "records",
          title: toAssistantText(pack?.title, 80),
          reason: toAssistantText(pack?.reason, 160),
          items: Array.isArray(pack?.items)
            ? pack.items.map((item) => ({
                name: toAssistantText(item?.name, 40),
                category: toAssistantText(item?.category, 40),
                summary: toAssistantText(item?.summary, 180),
                latestExam: toAssistantText(item?.latestExam, 80),
                latestTotal: Number.isFinite(Number(item?.latestTotal)) ? Number(item.latestTotal) : null,
                previousTotal: Number.isFinite(Number(item?.previousTotal)) ? Number(item.previousTotal) : null,
                trend: Number.isFinite(Number(item?.trend)) ? Number(item.trend) : null,
                latestScores: Array.isArray(item?.latestScores) ? item.latestScores.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 10) : [],
                weakSubjects: Array.isArray(item?.weakSubjects) ? item.weakSubjects.map((value) => toAssistantText(value, 60)).filter(Boolean).slice(0, 3) : [],
                exams: Array.isArray(item?.exams) ? item.exams.map((value) => toAssistantText(value, 180)).filter(Boolean).slice(0, 40) : [],
                records: Array.isArray(item?.records) ? item.records.map((value) => toAssistantText(value, 140)).filter(Boolean).slice(0, 8) : [],
                tags: Array.isArray(item?.tags) ? item.tags.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 8) : [],
                dormitory: toAssistantText(item?.dormitory, 80),
                members: Array.isArray(item?.members) ? item.members.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 12) : [],
                events: Array.isArray(item?.events) ? item.events.map((value) => toAssistantText(value, 140)).filter(Boolean).slice(0, 8) : []
              })).slice(0, 20)
            : []
        })).filter((pack) => pack.title && pack.items.length).slice(0, 6)
      : [],
    comparisonContext: trimAssistantComparisonContext(context?.comparisonContext)
  };
}
