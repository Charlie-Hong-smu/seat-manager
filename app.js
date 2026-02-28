const COLS = 8;
const STORAGE_KEY = "homeroom-seat-manager-v1";
const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];
const BACKUP_VERSION = 1;
const SIDEBAR_SECTION_STATE_KEY = "sidebarSectionOpen-v1";
const SIDEBAR_ACTIVE_TAB_KEY = "sidebarActiveTab-v1";
const SEAT_CARD_MODE_KEY = "seatCardMode";
const TAG_CATALOG = [
  { id: "cn_strong", labelZh: "语文强", kind: "academic", groupId: "lvl_cn", groupNameZh: "语文水平" },
  { id: "cn_mid", labelZh: "语文中", kind: "academic", groupId: "lvl_cn", groupNameZh: "语文水平" },
  { id: "cn_weak", labelZh: "语文弱", kind: "academic", groupId: "lvl_cn", groupNameZh: "语文水平" },
  { id: "math_strong", labelZh: "数学强", kind: "academic", groupId: "lvl_math", groupNameZh: "数学水平" },
  { id: "math_mid", labelZh: "数学中", kind: "academic", groupId: "lvl_math", groupNameZh: "数学水平" },
  { id: "math_weak", labelZh: "数学弱", kind: "academic", groupId: "lvl_math", groupNameZh: "数学水平" },
  { id: "en_strong", labelZh: "英语强", kind: "academic", groupId: "lvl_en", groupNameZh: "英语水平" },
  { id: "en_mid", labelZh: "英语中", kind: "academic", groupId: "lvl_en", groupNameZh: "英语水平" },
  { id: "en_weak", labelZh: "英语弱", kind: "academic", groupId: "lvl_en", groupNameZh: "英语水平" },
  { id: "talkative", labelZh: "爱讲话", kind: "behavior", groupId: "trait_talk", groupNameZh: "课堂表达" },
  { id: "quiet", labelZh: "沉默", kind: "behavior", groupId: "trait_talk", groupNameZh: "课堂表达" },
  { id: "distractible", labelZh: "容易分心", kind: "behavior", groupId: "trait_focus", groupNameZh: "专注情况" },
  { id: "focused", labelZh: "专注", kind: "behavior", groupId: "trait_focus", groupNameZh: "专注情况" },
  { id: "leader", labelZh: "主动", kind: "behavior", groupId: "trait_role", groupNameZh: "课堂角色" },
  { id: "supporter", labelZh: "配合", kind: "behavior", groupId: "trait_role", groupNameZh: "课堂角色" }
];
const TAG_BY_ID = new Map(TAG_CATALOG.map((tag) => [tag.id, tag]));
const TAG_GROUPS = TAG_CATALOG.reduce((map, tag) => {
  if (!map.has(tag.groupId)) {
    map.set(tag.groupId, { id: tag.groupId, name: tag.groupNameZh, kind: tag.kind, tags: [] });
  }
  map.get(tag.groupId).tags.push(tag);
  return map;
}, new Map());
const BEHAVIOR_TAG_GROUPS = Array.from(TAG_GROUPS.values()).filter((group) => group.kind === "behavior");
const ACADEMIC_TAG_GROUPS = Array.from(TAG_GROUPS.values()).filter((group) => group.kind === "academic");
const ACADEMIC_SUBJECT_GROUP = {
  语文: "lvl_cn",
  数学: "lvl_math",
  英语: "lvl_en"
};
const COMPLEMENT_RULES = [
  { id: "talk_quiet", labelZh: "爱讲话 ↔ 沉默", leftTagId: "talkative", rightTagId: "quiet" },
  { id: "focus_balance", labelZh: "容易分心 ↔ 专注", leftTagId: "distractible", rightTagId: "focused" },
  { id: "role_balance", labelZh: "主动 ↔ 配合", leftTagId: "leader", rightTagId: "supporter" },
  { id: "cn_balance", labelZh: "语文强 ↔ 语文弱", leftTagId: "cn_strong", rightTagId: "cn_weak" },
  { id: "math_balance", labelZh: "数学强 ↔ 数学弱", leftTagId: "math_strong", rightTagId: "math_weak" },
  { id: "en_balance", labelZh: "英语强 ↔ 英语弱", leftTagId: "en_strong", rightTagId: "en_weak" }
];

const studentNameInput = document.getElementById("studentNameInput");
const studentAliasInput = document.getElementById("studentAliasInput");
const studentGenderSelect = document.getElementById("studentGenderSelect");
const addStudentBtn = document.getElementById("addStudentBtn");
const studentSearchInput = document.getElementById("studentSearchInput");
const searchResults = document.getElementById("searchResults");
const studentCount = document.getElementById("studentCount");
const seatTotal = document.getElementById("seatTotal");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const cardCompactBtn = document.getElementById("cardCompactBtn");
const cardDetailBtn = document.getElementById("cardDetailBtn");

const drawCount = document.getElementById("drawCount");
const noRepeat = document.getElementById("noRepeat");
const drawBtn = document.getElementById("drawBtn");
const resetDrawBtn = document.getElementById("resetDrawBtn");
const clearDrawHistoryBtn = document.getElementById("clearDrawHistoryBtn");
const drawStatus = document.getElementById("drawStatus");
const drawResults = document.getElementById("drawResults");

const shuffleSeatsBtn = document.getElementById("shuffleSeatsBtn");
const resetSeatsBtn = document.getElementById("resetSeatsBtn");
const pairByGender = document.getElementById("pairByGender");

const importFileInput = document.getElementById("importFileInput");
const importReplace = document.getElementById("importReplace");
const importBtn = document.getElementById("importBtn");
const importStatus = document.getElementById("importStatus");
const exportSeatsBtn = document.getElementById("exportSeatsBtn");
const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupInput = document.getElementById("importBackupInput");
const importBackupBtn = document.getElementById("importBackupBtn");
const backupInfo = document.getElementById("backupInfo");
const backupReminder = document.getElementById("backupReminder");
const backupReminderText = document.getElementById("backupReminderText");
const backupReminderExportBtn = document.getElementById("backupReminderExportBtn");

const scoreFileInput = document.getElementById("scoreFileInput");
const parseScoreBtn = document.getElementById("parseScoreBtn");
const scoreExamName = document.getElementById("scoreExamName");
const scoreExamDate = document.getElementById("scoreExamDate");
const saveScoreBtn = document.getElementById("saveScoreBtn");
const scoreStatus = document.getElementById("scoreStatus");
const existingExamSelect = document.getElementById("existingExamSelect");
const replaceExamBtn = document.getElementById("replaceExamBtn");
const deleteExamBtn = document.getElementById("deleteExamBtn");
const autoAcademicEnabled = document.getElementById("autoAcademicEnabled");
const autoAcademicRangeMode = document.getElementById("autoAcademicRangeMode");
const autoAcademicRecentWrap = document.getElementById("autoAcademicRecentWrap");
const autoAcademicRecentN = document.getElementById("autoAcademicRecentN");
const autoAcademicTopN = document.getElementById("autoAcademicTopN");
const autoAcademicBottomN = document.getElementById("autoAcademicBottomN");
const autoAcademicIncludeMid = document.getElementById("autoAcademicIncludeMid");
const recomputeAcademicBtn = document.getElementById("recomputeAcademicBtn");
const autoAcademicStatus = document.getElementById("autoAcademicStatus");

const saveHistoryBtn = document.getElementById("saveHistoryBtn");
const historyList = document.getElementById("historyList");
const historyFilterInput = document.getElementById("historyFilterInput");

const rowLabels = document.getElementById("rowLabels");
const seatGroups = document.getElementById("seatGroups");

const recordModal = document.getElementById("recordModal");
const recordStudentName = document.getElementById("recordStudentName");
const recordClose = document.getElementById("recordClose");
const recordNoteInput = document.getElementById("recordNoteInput");
const addRewardBtn = document.getElementById("addRewardBtn");
const addPunishBtn = document.getElementById("addPunishBtn");
const addNoteBtn = document.getElementById("addNoteBtn");
const recordList = document.getElementById("recordList");
const weekSelect = document.getElementById("weekSelect");
const examList = document.getElementById("examList");
const examTrends = document.getElementById("examTrends");
const exportTrendsBtn = document.getElementById("exportTrendsBtn");
const examTrendModeSelect = document.getElementById("examTrendModeSelect");
const deleteStudentBtn = document.getElementById("deleteStudentBtn");
const behaviorTagGroups = document.getElementById("behaviorTagGroups");
const academicAutoTags = document.getElementById("academicAutoTags");
const allowAcademicManualOverride = document.getElementById("allowAcademicManualOverride");
const academicTagGroups = document.getElementById("academicTagGroups");
const applySearchInput = document.getElementById("applySearchInput");
const applyList = document.getElementById("applyList");
const applyAllBtn = document.getElementById("applyAllBtn");
const applyClearBtn = document.getElementById("applyClearBtn");

const historyModal = document.getElementById("historyModal");
const historyTitle = document.getElementById("historyTitle");
const historyClose = document.getElementById("historyClose");
const historyGrid = document.getElementById("historyGrid");
const historyGridInner = document.getElementById("historyGridInner");
const exportModal = document.getElementById("exportModal");
const exportModalClose = document.getElementById("exportModalClose");
const exportModalCancel = document.getElementById("exportModalCancel");
const exportModalConfirm = document.getElementById("exportModalConfirm");
const exportOptScores = document.getElementById("exportOptScores");
const exportOptRecords = document.getElementById("exportOptRecords");
const exportOptNotes = document.getElementById("exportOptNotes");

const mappingModal = document.getElementById("mappingModal");
const mappingList = document.getElementById("mappingList");
const mappingConflicts = document.getElementById("mappingConflicts");
const mappingClose = document.getElementById("mappingClose");
const mappingCancel = document.getElementById("mappingCancel");
const mappingApply = document.getElementById("mappingApply");
const toast = document.getElementById("toast");
const easterModal = document.getElementById("easterModal");
const easterText = document.getElementById("easterText");
const easterClose = document.getElementById("easterClose");
const keepLockedEmpty = document.getElementById("keepLockedEmpty");
const lockPairAInput = document.getElementById("lockPairAInput");
const lockPairBInput = document.getElementById("lockPairBInput");
const lockPairASuggest = document.getElementById("lockPairASuggest");
const lockPairBSuggest = document.getElementById("lockPairBSuggest");
const addLockPairBtn = document.getElementById("addLockPairBtn");
const lockPairList = document.getElementById("lockPairList");
const pairAInput = document.getElementById("pairAInput");
const pairBInput = document.getElementById("pairBInput");
const pairASuggest = document.getElementById("pairASuggest");
const pairBSuggest = document.getElementById("pairBSuggest");
const addNoDeskPairBtn = document.getElementById("addNoDeskPairBtn");
const noDeskPairList = document.getElementById("noDeskPairList");
const frontStudentInput = document.getElementById("frontStudentInput");
const frontStudentSuggest = document.getElementById("frontStudentSuggest");
const addFrontStudentBtn = document.getElementById("addFrontStudentBtn");
const frontRowsInput = document.getElementById("frontRowsInput");
const frontStudentList = document.getElementById("frontStudentList");
const shuffleByComplementBtn = document.getElementById("shuffleByComplementBtn");
const complementModal = document.getElementById("complementModal");
const complementClose = document.getElementById("complementClose");
const complementRuleList = document.getElementById("complementRuleList");
const complementRuleSelect = document.getElementById("complementRuleSelect");
const complementPairByGender = document.getElementById("complementPairByGender");
const complementRespectNoDesk = document.getElementById("complementRespectNoDesk");
const complementRespectFrontRows = document.getElementById("complementRespectFrontRows");
const complementRespectLockedPairs = document.getElementById("complementRespectLockedPairs");
const complementRespectLocked = document.getElementById("complementRespectLocked");
const complementKeepLockedEmpty = document.getElementById("complementKeepLockedEmpty");
const complementStatus = document.getElementById("complementStatus");
const complementPreviewBtn = document.getElementById("complementPreviewBtn");
const complementApplyBtn = document.getElementById("complementApplyBtn");

let state = loadState();
let activeStudentId = null;
let dragSourceIndex = null;
let swapHighlight = new Set();
let seatFlashHighlight = new Set();
let activeWeekKey = getWeekKey(new Date());
let examDraft = null;
let mappingState = null;
let applyTargets = new Set();
let lastEasterAt = 0;
let backupReminderChecked = false;
let allowAcademicOverride = false;
let complementPreviewOrder = null;
let examTrendMode = "score";
const inputSuggestMap = new Map();

function uid() {
  return `id-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

function normalizeName(name) {
  if (!name) {
    return "";
  }
  return name
    .toString()
    .replace(/\u3000/g, " ")
    .replace(/[()（）][^()（）]*[()（）]/g, "")
    .replace(/(同学|学生)$/g, "")
    .replace(/\s+/g, "")
    .replace(/[·•・、，,。.\\\-—_~`!@#$%^&*+=:;"'<>?？【】\[\]{}]/g, "")
    .trim();
}

function normalizeHeader(text) {
  if (!text) {
    return "";
  }
  let value = text.toString().trim();
  value = value.replace(/\s+/g, "");
  value = value.replace(/[()（）][^()（）]*[()（）]/g, "");
  value = value.replace(/成绩|分数|得分/g, "");
  value = value.replace(/满分\\d+/g, "");
  value = value.replace(/第\\d+次/g, "");
  value = value.replace(/第.+次/g, "");
  value = value.replace(/第\\d+/g, "");
  return value.trim();
}

function parseAliasInput(value) {
  if (!value) {
    return [];
  }
  const parts = value
    .split(/[，,、;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seenGroups = new Set();
  const sanitized = [];
  tags.forEach((tagId) => {
    const id = tagId?.toString().trim();
    const tag = TAG_BY_ID.get(id);
    if (!tag || seenGroups.has(tag.groupId)) {
      return;
    }
    seenGroups.add(tag.groupId);
    sanitized.push(id);
  });
  return sanitized;
}

function getTagByGroup(tags, groupId) {
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const tag = TAG_BY_ID.get(tags[i]);
    if (tag && tag.groupId === groupId) {
      return tag.id;
    }
  }
  return "";
}

function ensureStudentTagFields(student) {
  student.manualTags = sanitizeTags(student.manualTags);
  student.autoTags = sanitizeTags(student.autoTags);
  return student;
}

function getEffectiveTags(student) {
  const manual = sanitizeTags(student.manualTags);
  const auto = sanitizeTags(student.autoTags);
  const picked = new Map();
  auto.forEach((id) => {
    const tag = TAG_BY_ID.get(id);
    if (tag) {
      picked.set(tag.groupId, id);
    }
  });
  manual.forEach((id) => {
    const tag = TAG_BY_ID.get(id);
    if (tag) {
      picked.set(tag.groupId, id);
    }
  });
  return Array.from(picked.values());
}

function setStudentManualGroupTag(student, groupId, tagId) {
  ensureStudentTagFields(student);
  student.manualTags = student.manualTags.filter((id) => {
    const tag = TAG_BY_ID.get(id);
    return !tag || tag.groupId !== groupId;
  });
  if (tagId) {
    const tag = TAG_BY_ID.get(tagId);
    if (tag && tag.groupId === groupId) {
      student.manualTags.push(tagId);
    }
  }
}

function setStudentAutoGroupTag(student, groupId, tagId) {
  ensureStudentTagFields(student);
  student.autoTags = student.autoTags.filter((id) => {
    const tag = TAG_BY_ID.get(id);
    return !tag || tag.groupId !== groupId;
  });
  if (tagId) {
    const tag = TAG_BY_ID.get(tagId);
    if (tag && tag.groupId === groupId) {
      student.autoTags.push(tagId);
    }
  }
}

function getAutoAcademicSettings() {
  const raw = state.settings?.autoAcademic || {};
  return {
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    rangeMode: raw.rangeMode === "recent" ? "recent" : "all",
    recentN: Math.min(20, Math.max(1, Number.parseInt(raw.recentN, 10) || 3)),
    topN: Math.min(50, Math.max(1, Number.parseInt(raw.topN, 10) || 10)),
    bottomN: Math.min(50, Math.max(1, Number.parseInt(raw.bottomN, 10) || 10)),
    includeMid: Boolean(raw.includeMid)
  };
}

function getTagIdByLevel(subject, level) {
  const groupId = ACADEMIC_SUBJECT_GROUP[subject];
  const group = groupId ? TAG_GROUPS.get(groupId) : null;
  if (!group) {
    return "";
  }
  const suffix = level === "strong" ? "强" : level === "weak" ? "弱" : "中";
  const tag = group.tags.find((item) => item.labelZh.endsWith(suffix));
  return tag ? tag.id : "";
}

function formatDateTimeLocal(value) {
  if (!value) {
    return "从未";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "从未";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function showDuplicateNameWarning(sourceLabel = "名单") {
  const groups = new Map();
  state.students.forEach((student) => {
    const key = normalizeName(student.name);
    if (!key) {
      return;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(student.name);
  });
  const duplicates = Array.from(groups.values()).filter((items) => items.length > 1);
  if (!duplicates.length) {
    return;
  }
  const lines = duplicates.map((items) => `${items[0]} × ${items.length}`);
  alert(`${sourceLabel}存在重名：\n${lines.join("\n")}\n建议在别名或备注中做区分。`);
}

function resolveStudentByKeyword(input) {
  const key = normalizeName(input);
  if (!key) {
    return null;
  }
  const scored = state.students
    .map((student) => {
      const nameKey = normalizeName(student.name);
      const aliasKeys = (student.aliases || []).map((alias) => normalizeName(alias));
      let score = -1;
      if (nameKey === key || aliasKeys.includes(key)) {
        score = 100;
      } else if (nameKey.startsWith(key) || aliasKeys.some((alias) => alias.startsWith(key))) {
        score = 80;
      } else if (nameKey.includes(key) || aliasKeys.some((alias) => alias.includes(key))) {
        score = 60;
      }
      return { student, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].student : null;
}

function findStudentsByKeyword(keyword, limit = 8) {
  const key = normalizeName(keyword);
  if (!key) {
    return [];
  }
  return state.students
    .map((student) => {
      const nameKey = normalizeName(student.name);
      const aliasKeys = (student.aliases || []).map((alias) => normalizeName(alias));
      let score = -1;
      if (nameKey === key || aliasKeys.includes(key)) {
        score = 100;
      } else if (nameKey.startsWith(key) || aliasKeys.some((alias) => alias.startsWith(key))) {
        score = 85;
      } else if (nameKey.includes(key) || aliasKeys.some((alias) => alias.includes(key))) {
        score = 70;
      }
      return { student, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.student);
}

function hideInputSuggest(panel) {
  if (!panel) {
    return;
  }
  panel.classList.add("hidden");
  panel.innerHTML = "";
}

function renderInputSuggest(input, panel) {
  if (!input || !panel) {
    return;
  }
  const query = input.value.trim();
  const matches = findStudentsByKeyword(query);
  inputSuggestMap.set(input, matches);
  panel.innerHTML = "";
  if (!query || !matches.length) {
    hideInputSuggest(panel);
    return;
  }
  matches.forEach((student) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "name-suggest-item";
    item.innerHTML = `${student.name}${student.aliases?.length ? `<span>${student.aliases.join(" / ")}</span>` : ""}`;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = student.name;
      hideInputSuggest(panel);
    });
    panel.appendChild(item);
  });
  panel.classList.remove("hidden");
}

function setupNameSuggest(input, panel) {
  if (!input || !panel) {
    return;
  }
  input.addEventListener("input", () => {
    renderInputSuggest(input, panel);
  });
  input.addEventListener("focus", () => {
    renderInputSuggest(input, panel);
  });
  input.addEventListener("blur", () => {
    setTimeout(() => hideInputSuggest(panel), 140);
  });
}

function tryPickFirstSuggestion(input) {
  const list = inputSuggestMap.get(input) || [];
  if (!list.length) {
    return false;
  }
  const first = list[0];
  if (!first) {
    return false;
  }
  if (normalizeName(input.value) === normalizeName(first.name)) {
    return false;
  }
  input.value = first.name;
  return true;
}

function showToast(message, type = "info") {
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.remove("success", "error", "info");
  toast.classList.add(type);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function maybeShowEasterEgg(triggerText) {
  const normalized = normalizeName(triggerText);
  const triggersA = new Set([normalizeName("洪丞林")]);
  const triggersB = new Set([normalizeName("张秋萍"), normalizeName("cheongqp")]);
  let mode = "";
  if (triggersA.has(normalized)) {
    mode = "A";
  } else if (triggersB.has(normalized)) {
    mode = "B";
  } else {
    return;
  }
  const now = Date.now();
  if (now - lastEasterAt < 1500) {
    return;
  }
  lastEasterAt = now;

  if (Math.random() > 0.35) {
    return;
  }

  let message = "";
  if (mode === "A") {
    const common = [
      "我也想你啦！猪！",
      "又在偷偷想我不专心改卷！",
      "卷子改完啦？",
      "今天锻炼了没！",
      "该骑车啦！",
      "别太辛苦笨蛋！改不完的卷子明天再改！",
      "今天你开心吗！",
      "别为学生发火！",
      "要相信自己笨蛋，你可是最棒的小猪！"
    ];
    const special = [
      { text: "累不累，奖励自己一杯喜茶吧！（凭此弹窗找小洪兑换一杯喜茶）", weight: 0.05 },
      { text: "困死了是不是，那就瑞一下！（凭此弹窗找小洪兑换一杯瑞幸）", weight: 0.05 }
    ];
    const roll = Math.random();
    if (roll < special[0].weight) {
      message = special[0].text;
    } else if (roll < special[0].weight + special[1].weight) {
      message = special[1].text;
    } else {
      message = common[Math.floor(Math.random() * common.length)];
    }
  } else {
    const list = [
      "猪！",
      "你要当学生吗小笨蛋！",
      "你正在搜索世界上最可爱的小猪",
      "是不是又没回小洪信息",
      "今天准时想小洪了吗",
      "要开心！",
      "今天学生乖不乖，闯祸了没有！"
    ];
    message = list[Math.floor(Math.random() * list.length)];
  }

  easterText.textContent = message;
  easterModal.classList.remove("hidden");
  easterModal.setAttribute("aria-hidden", "false");
}

function closeEasterModal() {
  easterModal.classList.add("hidden");
  easterModal.setAttribute("aria-hidden", "true");
}

function getSeatCapacityFromCount(count) {
  if (!count) {
    return 0;
  }
  return Math.ceil(count / COLS) * COLS;
}

function getSeatCapacity() {
  const lastAssignedIndex = state.seatOrder
    ? [...state.seatOrder].reverse().findIndex((id) => id !== null && id !== undefined)
    : -1;
  const lastIndex = lastAssignedIndex === -1 ? -1 : state.seatOrder.length - 1 - lastAssignedIndex;
  const minNeeded = Math.max(state.students.length, lastIndex + 1);
  return getSeatCapacityFromCount(minNeeded);
}

function getRowCount() {
  const capacity = getSeatCapacity();
  return capacity ? capacity / COLS : 0;
}

function getRowCountFromSeatCount(seatCount) {
  if (!seatCount) {
    return 0;
  }
  return Math.ceil(seatCount / COLS);
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn("无法读取本地数据", error);
  }

  return {
    students: [],
    seatOrder: [],
    lockedSeats: [],
    seatHistory: [],
    exams: [],
    lastBackupAt: "",
    settings: {
      sidebarCollapsed: false,
      pairByGender: false,
      keepLockedEmpty: true,
      autoAcademic: {
        enabled: true,
        rangeMode: "all",
        recentN: 3,
        topN: 10,
        bottomN: 10,
        includeMid: false
      },
      constraints: {
        lockedDeskmatePairs: [],
        noDeskmatePairs: [],
        frontRowStudentIds: [],
        frontRows: 2,
        maxRetries: 200
      }
    },
    draw: {
      noRepeat: false,
      used: [],
      history: []
    }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState() {
  state.students = Array.isArray(state.students) ? state.students : [];
  state.students = state.students.map((student) => ({
    ...student,
    gender: student.gender || "",
    aliases: Array.isArray(student.aliases) ? student.aliases.filter(Boolean).map((x) => x.toString().trim()).filter(Boolean) : [],
    records: Array.isArray(student.records) ? student.records : [],
    manualTags: sanitizeTags(student.manualTags),
    autoTags: sanitizeTags(student.autoTags),
    exams: Array.isArray(student.exams) ? student.exams : []
  }));
  state.seatOrder = Array.isArray(state.seatOrder) ? state.seatOrder : [];
  state.lockedSeats = Array.isArray(state.lockedSeats)
    ? state.lockedSeats.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value >= 0)
    : [];
  state.seatHistory = Array.isArray(state.seatHistory) ? state.seatHistory : [];
  state.exams = Array.isArray(state.exams) ? state.exams : [];
  state.lastBackupAt = state.lastBackupAt || "";
  state.settings = state.settings || {
    sidebarCollapsed: false,
    pairByGender: false,
    keepLockedEmpty: true,
    autoAcademic: {},
    constraints: {}
  };
  state.settings.sidebarCollapsed = Boolean(state.settings.sidebarCollapsed);
  state.settings.pairByGender = Boolean(state.settings.pairByGender);
  state.settings.keepLockedEmpty =
    state.settings.keepLockedEmpty === undefined ? true : Boolean(state.settings.keepLockedEmpty);
  state.settings.autoAcademic = getAutoAcademicSettings();
  state.settings.constraints = state.settings.constraints || {};
  state.settings.constraints.lockedDeskmatePairs = Array.isArray(
    state.settings.constraints.lockedDeskmatePairs
  )
    ? state.settings.constraints.lockedDeskmatePairs
        .map((pair) => ({ a: pair?.a || "", b: pair?.b || "" }))
        .filter((pair) => pair.a && pair.b && pair.a !== pair.b)
    : [];
  state.settings.constraints.noDeskmatePairs = Array.isArray(state.settings.constraints.noDeskmatePairs)
    ? state.settings.constraints.noDeskmatePairs
        .map((pair) => ({ a: pair?.a || "", b: pair?.b || "" }))
        .filter((pair) => pair.a && pair.b)
    : [];
  state.settings.constraints.frontRowStudentIds = Array.isArray(state.settings.constraints.frontRowStudentIds)
    ? state.settings.constraints.frontRowStudentIds
    : [];
  state.settings.constraints.frontRows = Math.max(
    1,
    Number.parseInt(state.settings.constraints.frontRows, 10) || 2
  );
  state.settings.constraints.maxRetries = Math.max(
    50,
    Number.parseInt(state.settings.constraints.maxRetries, 10) || 200
  );
  state.draw = state.draw || { noRepeat: false, used: [], history: [] };
  state.draw.used = Array.isArray(state.draw.used) ? state.draw.used : [];
  state.draw.history = Array.isArray(state.draw.history) ? state.draw.history : [];

  normalizeSeatOrder();
  migrateDrawPool();
  pruneDrawUsed();
  pruneSeatHistory();
  normalizeLocks();
  normalizeConstraints();
}

function normalizeLocks() {
  const max = state.seatOrder.length;
  const unique = new Set();
  state.lockedSeats = state.lockedSeats
    .filter((index) => Number.isInteger(index) && index >= 0 && index < max)
    .filter((index) => {
      if (unique.has(index)) {
        return false;
      }
      unique.add(index);
      return true;
    });
}

function normalizeConstraints() {
  const idSet = new Set(state.students.map((student) => student.id));
  state.settings.constraints.frontRowStudentIds = state.settings.constraints.frontRowStudentIds.filter((id) =>
    idSet.has(id)
  );
  state.settings.constraints.noDeskmatePairs = state.settings.constraints.noDeskmatePairs.filter(
    (pair) => pair.a && pair.b && pair.a !== pair.b && idSet.has(pair.a) && idSet.has(pair.b)
  );
  state.settings.constraints.lockedDeskmatePairs =
    state.settings.constraints.lockedDeskmatePairs.filter(
      (pair) => pair.a && pair.b && pair.a !== pair.b && idSet.has(pair.a) && idSet.has(pair.b)
    );
}

function normalizeSeatOrder() {
  const ids = state.students.map((student) => student.id);
  const idSet = new Set(ids);
  const total = getSeatCapacity();
  const used = new Set();
  if (!total) {
    state.seatOrder = [];
    return;
  }

  const order = new Array(total).fill(null);
  state.seatOrder.forEach((id, index) => {
    if (index >= total) {
      return;
    }
    if (idSet.has(id) && !used.has(id)) {
      used.add(id);
      order[index] = id;
    }
  });

  ids.forEach((id) => {
    if (used.has(id)) {
      return;
    }
    const emptyIndex = order.indexOf(null);
    if (emptyIndex !== -1) {
      order[emptyIndex] = id;
      used.add(id);
    }
  });

  state.seatOrder = order;
}

function placeStudentInFirstEmpty(studentId) {
  if (state.seatOrder.includes(studentId)) {
    return;
  }
  const emptyIndex = state.seatOrder.indexOf(null);
  if (emptyIndex !== -1) {
    state.seatOrder[emptyIndex] = studentId;
  }
}

function migrateDrawPool() {
  if (!Array.isArray(state.draw.remaining)) {
    return;
  }

  const ids = state.students.map((student) => student.id);
  const remainingSet = new Set(state.draw.remaining);
  const inferredUsed = ids.filter((id) => !remainingSet.has(id));
  state.draw.used = Array.from(new Set([...state.draw.used, ...inferredUsed]));
  delete state.draw.remaining;
}

function pruneDrawUsed() {
  const ids = new Set(state.students.map((student) => student.id));
  state.draw.used = state.draw.used.filter((id) => ids.has(id));
}

function addStudent(name, genderValue = "", aliases = []) {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }

  state.students.push({
    id: uid(),
    name: trimmed,
    gender: genderValue || "",
    aliases: parseAliasInput(Array.isArray(aliases) ? aliases.join(" ") : aliases),
    records: [],
    manualTags: [],
    autoTags: [],
    exams: []
  });
  normalizeSeatOrder();
  placeStudentInFirstEmpty(state.students[state.students.length - 1].id);
  showDuplicateNameWarning("新增后");
  saveState();
  renderAll();
}

function updateStudentName(id, name) {
  const student = state.students.find((item) => item.id === id);
  if (!student) {
    return;
  }

  const trimmed = name.trim();
  student.name = trimmed || student.name;
  saveState();
  renderAll();
}

function removeStudent(id) {
  state.students = state.students.filter((item) => item.id !== id);
  state.seatOrder = state.seatOrder.map((item) => (item === id ? null : item));
  state.draw.used = state.draw.used.filter((item) => item !== id);
  state.settings.constraints.frontRowStudentIds = state.settings.constraints.frontRowStudentIds.filter(
    (item) => item !== id
  );
  state.settings.constraints.noDeskmatePairs = state.settings.constraints.noDeskmatePairs.filter(
    (pair) => pair.a !== id && pair.b !== id
  );
  state.settings.constraints.lockedDeskmatePairs =
    state.settings.constraints.lockedDeskmatePairs.filter((pair) => pair.a !== id && pair.b !== id);
  saveState();
  renderAll();
}

function countRecords(student, type) {
  const weekKey = getWeekKey(new Date());
  return countRecordsByWeek(student, type, weekKey);
}

function countRecordsByWeek(student, type, weekKey) {
  return (student.records || []).filter(
    (record) => record.type === type && (record.weekKey || getWeekKey(record.date)) === weekKey
  ).length;
}

function renderSearchResults() {
  searchResults.innerHTML = "";
  studentCount.textContent = state.students.length.toString();

  if (state.students.length === 0) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无学生，先在上方输入姓名。";
    searchResults.appendChild(empty);
    return;
  }

  const query = studentSearchInput.value.trim();
  const normalizedQuery = normalizeName(query);
  const matched = query
    ? state.students.filter((student) => {
        if (student.name.includes(query)) {
          return true;
        }
        if (normalizedQuery && normalizeName(student.name).includes(normalizedQuery)) {
          return true;
        }
        return (student.aliases || []).some((alias) => {
          const aliasText = alias.toString();
          return aliasText.includes(query) || normalizeName(aliasText).includes(normalizedQuery);
        });
      })
    : [];

  if (!query) {
    const tip = document.createElement("div");
    tip.className = "draw-status";
    tip.textContent = "输入姓名关键词即可快速定位学生。";
    searchResults.appendChild(tip);
    return;
  }

  if (!matched.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "未找到匹配学生。";
    searchResults.appendChild(empty);
    return;
  }

  matched.forEach((student) => {
    const row = document.createElement("div");
    row.className = "student-row";

    const name = document.createElement("div");
    name.textContent = student.name;
    if (student.aliases?.length) {
      const alias = document.createElement("div");
      alias.className = "student-alias";
      alias.textContent = `别名：${student.aliases.join(" / ")}`;
      name.appendChild(alias);
    }

    const meta = document.createElement("div");
    meta.className = "student-meta";
    const genderLabel = student.gender ? ` · ${student.gender}` : "";
    meta.innerHTML = `奖 <span class="count-reward">${countRecords(
      student,
      "奖"
    )}</span> / 罚 <span class="count-punish">${countRecords(student, "罚")}</span>${genderLabel}`;

    const recordBtn = document.createElement("button");
    recordBtn.textContent = "奖罚记录";
    recordBtn.className = "ghost";
    recordBtn.addEventListener("click", () => openRecordModal(student.id));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "删除";
    removeBtn.className = "danger";
    removeBtn.addEventListener("click", () => {
      if (confirm(`确定删除 ${student.name} 吗？`)) {
        removeStudent(student.id);
      }
    });

    row.append(name, meta, recordBtn, removeBtn);
    searchResults.appendChild(row);
  });
}

function renderRowLabels() {
  rowLabels.innerHTML = "";
  const rows = getRowCount();
  rowLabels.style.gridTemplateRows = rows ? `repeat(${rows}, var(--seat-height))` : "none";
  for (let row = 1; row <= rows; row += 1) {
    const label = document.createElement("div");
    label.textContent = `第 ${row} 行`;
    rowLabels.appendChild(label);
  }
}

function getChangedSeatIndices(beforeOrder, afterOrder) {
  const changed = [];
  const len = Math.max(beforeOrder.length, afterOrder.length);
  for (let i = 0; i < len; i += 1) {
    if ((beforeOrder[i] || null) !== (afterOrder[i] || null)) {
      changed.push(i);
    }
  }
  return changed;
}

function queueSeatFlash(indices) {
  seatFlashHighlight = new Set((indices || []).filter((index) => Number.isInteger(index) && index >= 0));
}

function getSeatDisplayTags(student) {
  const tags = sortTagsForSeatDisplay(getEffectiveTags(student))
    .map((id) => TAG_BY_ID.get(id))
    .filter(Boolean);
  return tags;
}

function estimateSeatTagRows(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return 0;
  }
  const usableWidth = 102;
  let rows = 1;
  let currentWidth = 0;
  tags.forEach((tag) => {
    const textLength = Array.from(tag?.labelZh || "").length;
    const chipWidth = Math.max(40, textLength * 12 + 18);
    if (currentWidth > 0 && currentWidth + 4 + chipWidth > usableWidth) {
      rows += 1;
      currentWidth = chipWidth;
    } else {
      currentWidth = currentWidth > 0 ? currentWidth + 4 + chipWidth : chipWidth;
    }
  });
  return rows;
}

function getUniformSeatHeight() {
  if (document.body.classList.contains("compact-cards")) {
    return 112;
  }
  const maxTagRows = state.students.reduce(
    (max, student) => Math.max(max, estimateSeatTagRows(getSeatDisplayTags(student))),
    0
  );
  const baseHeight = 132;
  const perRowHeight = 24;
  const extraHeight = maxTagRows > 0 ? maxTagRows * perRowHeight + 6 : 0;
  return baseHeight + extraHeight;
}

function renderSeatGrid() {
  seatGroups.innerHTML = "";
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const lockedSet = new Set(state.lockedSeats);
  const rows = getRowCount();
  document.documentElement.style.setProperty("--seat-height", `${getUniformSeatHeight()}px`);

  if (!rows) {
    return;
  }

  for (let group = 0; group < COLS / 2; group += 1) {
    const groupEl = document.createElement("div");
    groupEl.className = "seat-group";
    groupEl.style.gridTemplateRows = `repeat(${rows}, var(--seat-height))`;

    for (let row = 0; row < rows; row += 1) {
      for (let colInGroup = 0; colInGroup < 2; colInGroup += 1) {
        const col = group * 2 + colInGroup + 1;
        const index = row * COLS + (col - 1);
        const studentId = state.seatOrder[index];
        const student = studentId ? studentById.get(studentId) : null;
        const isLocked = lockedSet.has(index);

        const seat = document.createElement("div");
        seat.className = "seat";
        if (isLocked) {
          seat.classList.add("locked");
        }
        if (!student) {
          seat.classList.add("empty");
        }
        seat.dataset.index = index.toString();
        seat.draggable = Boolean(student);

        const name = document.createElement("div");
        name.className = "seat-name";
        name.textContent = student ? student.name : "空";
        if (student) {
          const length = Array.from(student.name || "").length;
          if (length >= 4) {
            name.classList.add("long");
          }
        }

        const meta = document.createElement("div");
        meta.className = "seat-meta stats";
        if (student) {
          meta.innerHTML = `<span>奖 <span class="count-reward">${countRecords(
            student,
            "奖"
          )}</span></span><span>罚 <span class="count-punish">${countRecords(
            student,
            "罚"
          )}</span></span>`;
        } else {
          meta.textContent = "暂无学生";
        }

        const label = document.createElement("div");
        label.className = "seat-label";
        label.textContent = `${row + 1}-${col}`;

        const lockBtn = document.createElement("button");
        lockBtn.className = `seat-lock ${isLocked ? "active" : ""}`;
        lockBtn.type = "button";
        lockBtn.title = isLocked ? "取消锁定座位" : "锁定座位";
        lockBtn.textContent = isLocked ? "🔒" : "🔓";
        lockBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleSeatLock(index);
        });

        let tagRow = null;
        if (student) {
          const tags = getSeatDisplayTags(student);
          if (tags.length) {
            tagRow = document.createElement("div");
            tagRow.className = "seat-tag-row";
            tags.forEach((tag) => {
              const chip = document.createElement("span");
              let cls = "behavior";
              if (tag.id.endsWith("_strong")) {
                cls = "strong";
              } else if (tag.id.endsWith("_weak")) {
                cls = "weak";
              } else if (tag.id.endsWith("_mid")) {
                cls = "mid";
              }
              chip.className = `seat-tag-chip ${cls}`;
              chip.textContent = tag.labelZh;
              tagRow.appendChild(chip);
            });
          }
        }

        if (student && student.gender) {
          const gender = document.createElement("div");
          gender.className = "seat-meta gender";
          gender.textContent = `性别：${student.gender}`;
          if (tagRow) {
            seat.append(name, meta, gender, tagRow, label, lockBtn);
          } else {
            seat.append(name, meta, gender, label, lockBtn);
          }
        } else {
          if (tagRow) {
            seat.append(name, meta, tagRow, label, lockBtn);
          } else {
            seat.append(name, meta, label, lockBtn);
          }
        }

        if (swapHighlight.has(index)) {
          seat.classList.add("swap-animate");
        }
        if (seatFlashHighlight.has(index)) {
          seat.classList.add("flash");
        }
        if (student) {
          seat.addEventListener("click", () => openRecordModal(student.id));
        }
        attachSeatDragHandlers(seat, index, Boolean(student));
        groupEl.appendChild(seat);
      }
    }

    seatGroups.appendChild(groupEl);
  }

  if (swapHighlight.size) {
    const indices = new Set(swapHighlight);
    swapHighlight.clear();
    setTimeout(() => {
      document.querySelectorAll(".seat.swap-animate").forEach((item) => {
        item.classList.remove("swap-animate");
      });
      if (indices.size) {
        renderSeatGrid();
      }
    }, 360);
  }

  if (seatFlashHighlight.size) {
    setTimeout(() => {
      document.querySelectorAll(".seat.flash").forEach((item) => {
        item.classList.remove("flash");
      });
      seatFlashHighlight.clear();
    }, 760);
  }
}

function attachSeatDragHandlers(seat, index, hasStudent) {
  seat.addEventListener("dragstart", (event) => {
    if (!hasStudent) {
      event.preventDefault();
      return;
    }
    dragSourceIndex = index;
    seat.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", index.toString());
  });

  seat.addEventListener("dragend", () => {
    dragSourceIndex = null;
    seat.classList.remove("dragging");
    document.querySelectorAll(".seat.drag-over").forEach((item) => {
      item.classList.remove("drag-over");
    });
  });

  seat.addEventListener("dragover", (event) => {
    if (dragSourceIndex === null) {
      return;
    }
    event.preventDefault();
    seat.classList.add("drag-over");
    event.dataTransfer.dropEffect = "move";
  });

  seat.addEventListener("dragleave", () => {
    seat.classList.remove("drag-over");
  });

  seat.addEventListener("drop", (event) => {
    if (dragSourceIndex === null) {
      return;
    }
    event.preventDefault();
    seat.classList.remove("drag-over");
    const source = Number.parseInt(event.dataTransfer.getData("text/plain"), 10);
    if (Number.isNaN(source)) {
      return;
    }
    swapSeats(source, index);
  });
}

function swapSeats(sourceIndex, targetIndex) {
  if (sourceIndex === targetIndex) {
    return;
  }
  const next = [...state.seatOrder];
  const sourceValue = next[sourceIndex] || null;
  const targetValue = next[targetIndex] || null;
  next[sourceIndex] = targetValue;
  next[targetIndex] = sourceValue;
  state.seatOrder = next;
  swapHighlight = new Set([sourceIndex, targetIndex]);
  queueSeatFlash([sourceIndex, targetIndex]);
  saveState();
  renderSeatGrid();
}

function toggleSeatLock(index) {
  const set = new Set(state.lockedSeats);
  if (set.has(index)) {
    set.delete(index);
  } else {
    set.add(index);
  }
  state.lockedSeats = Array.from(set).sort((a, b) => a - b);
  saveState();
  renderSeatGrid();
}

function buildSeatOrderWithGenderPairs() {
  const students = [...state.students];
  const males = [];
  const females = [];
  const unknown = [];

  students.forEach((student) => {
    const gender = (student.gender || "").trim();
    if (gender === "男") {
      males.push(student);
    } else if (gender === "女") {
      females.push(student);
    } else {
      unknown.push(student);
    }
  });

  shuffleArray(males);
  shuffleArray(females);
  shuffleArray(unknown);

  const pairs = [];

  while (males.length && females.length) {
    pairs.push([males.pop().id, females.pop().id]);
  }

  const rest = [...males, ...females, ...unknown].map((student) => student.id);
  shuffleArray(rest);

  for (let i = 0; i < rest.length; i += 2) {
    const first = rest[i] || null;
    const second = rest[i + 1] || null;
    if (first || second) {
      pairs.push([first, second]);
    }
  }

  shuffleArray(pairs);

  const genderMap = new Map(state.students.map((student) => [student.id, student.gender]));
  const balance = {
    maleLeft: 0,
    maleRight: 0,
    femaleLeft: 0,
    femaleRight: 0
  };

  const seatCount = getSeatCapacityFromCount(state.students.length);
  if (!seatCount) {
    return [];
  }
  const rows = getRowCountFromSeatCount(seatCount);
  const order = new Array(seatCount).fill(null);
  let pairIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let group = 0; group < COLS / 2; group += 1) {
      const seatIndex = row * COLS + group * 2;
      const pair = pairs[pairIndex] || [null, null];
      const [leftId, rightId] = orientPair(pair, genderMap, balance);
      order[seatIndex] = leftId || null;
      order[seatIndex + 1] = rightId || null;
      pairIndex += 1;
    }
  }

  return order;
}

function orientPair(pair, genderMap, balance) {
  let [leftId, rightId] = pair;
  const leftGender = leftId ? (genderMap.get(leftId) || "").trim() : "";
  const rightGender = rightId ? (genderMap.get(rightId) || "").trim() : "";

  const isMixed =
    (leftGender === "男" && rightGender === "女") ||
    (leftGender === "女" && rightGender === "男");

  if (isMixed) {
    const maleId = leftGender === "男" ? leftId : rightId;
    const femaleId = leftGender === "女" ? leftId : rightId;
    if (balance.maleLeft > balance.maleRight) {
      leftId = femaleId;
      rightId = maleId;
    } else if (balance.maleRight > balance.maleLeft) {
      leftId = maleId;
      rightId = femaleId;
    } else if (Math.random() < 0.5) {
      leftId = femaleId;
      rightId = maleId;
    } else {
      leftId = maleId;
      rightId = femaleId;
    }
  } else if (leftId && rightId && Math.random() < 0.5) {
    [leftId, rightId] = [rightId, leftId];
  }

  if (leftId) {
    const gender = (genderMap.get(leftId) || "").trim();
    if (gender === "男") {
      balance.maleLeft += 1;
    } else if (gender === "女") {
      balance.femaleLeft += 1;
    }
  }

  if (rightId) {
    const gender = (genderMap.get(rightId) || "").trim();
    if (gender === "男") {
      balance.maleRight += 1;
    } else if (gender === "女") {
      balance.femaleRight += 1;
    }
  }

  return [leftId, rightId];
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getDeskPairsForSeatCount(seatCount) {
  const pairs = [];
  const rows = getRowCountFromSeatCount(seatCount);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < COLS; col += 2) {
      pairs.push([row * COLS + col, row * COLS + col + 1]);
    }
  }
  return pairs;
}

function areDeskmatesByIndex(indexA, indexB) {
  if (indexA < 0 || indexB < 0) {
    return false;
  }
  const rowA = Math.floor(indexA / COLS);
  const rowB = Math.floor(indexB / COLS);
  if (rowA !== rowB) {
    return false;
  }
  return Math.abs(indexA - indexB) === 1 && Math.floor((indexA % COLS) / 2) === Math.floor((indexB % COLS) / 2);
}

function evaluateShuffleOrder(order) {
  const issues = [];
  const idToName = new Map(state.students.map((student) => [student.id, student.name]));
  const idToGender = new Map(state.students.map((student) => [student.id, (student.gender || "").trim()]));
  const normalizedNoDeskPairs = state.settings.constraints.noDeskmatePairs.map((pair) => {
    const a = normalizeName(idToName.get(pair.a));
    const b = normalizeName(idToName.get(pair.b));
    return [a, b].sort().join("|");
  });
  const noDeskSet = new Set(normalizedNoDeskPairs.filter((item) => item !== "|"));

  let softPenalty = 0;
  getDeskPairsForSeatCount(order.length).forEach(([left, right]) => {
    const leftId = order[left];
    const rightId = order[right];
    if (!leftId || !rightId) {
      return;
    }
    const pairKey = [normalizeName(idToName.get(leftId)), normalizeName(idToName.get(rightId))]
      .sort()
      .join("|");
    if (noDeskSet.has(pairKey)) {
      issues.push(`不做同桌冲突：${idToName.get(leftId)} - ${idToName.get(rightId)}`);
    }
    if (state.settings.pairByGender) {
      const leftGender = idToGender.get(leftId);
      const rightGender = idToGender.get(rightId);
      if (leftGender && rightGender && leftGender === rightGender) {
        softPenalty += 1;
      }
    }
  });

  state.settings.constraints.lockedDeskmatePairs.forEach((pair) => {
    const leftIndex = order.indexOf(pair.a);
    const rightIndex = order.indexOf(pair.b);
    if (leftIndex === -1 || rightIndex === -1) {
      return;
    }
    if (!areDeskmatesByIndex(leftIndex, rightIndex)) {
      issues.push(`同桌锁定未满足：${idToName.get(pair.a) || "未知"} - ${idToName.get(pair.b) || "未知"}`);
    }
  });

  const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
  state.settings.constraints.frontRowStudentIds.forEach((studentId) => {
    const seatIndex = order.indexOf(studentId);
    if (seatIndex === -1) {
      return;
    }
    if (Math.floor(seatIndex / COLS) >= frontRows) {
      issues.push(`必须前排未满足：${idToName.get(studentId) || "未知学生"}`);
    }
  });

  return { hardViolations: issues.length, softPenalty, issues };
}

function generateCandidateOrderFromCurrent() {
  const total = state.seatOrder.length;
  const lockedSet = new Set(state.lockedSeats);
  const allowLockedEmptyFill = !state.settings.keepLockedEmpty;
  const fixedByIndex = new Map();
  const movableIndices = [];
  const movableStudents = [];
  const movableSet = new Set();

  for (let index = 0; index < total; index += 1) {
    const value = state.seatOrder[index] ?? null;
    const isLocked = lockedSet.has(index);
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

  const next = [...state.seatOrder];
  const movableIdsSet = new Set(movableStudents);
  const lockedPairs = (state.settings.constraints.lockedDeskmatePairs || []).filter(
    (pair) => movableIdsSet.has(pair.a) && movableIdsSet.has(pair.b)
  );
  const availableDeskPairs = getDeskPairsForSeatCount(total).filter(
    ([left, right]) => movableSet.has(left) && movableSet.has(right)
  );
  shuffleArray(availableDeskPairs);

  const usedIds = new Set();
  const assignedIndices = new Set();
  lockedPairs.forEach((pair) => {
    if (usedIds.has(pair.a) || usedIds.has(pair.b)) {
      return;
    }
    const deskPair = availableDeskPairs.find(
      ([left, right]) => !assignedIndices.has(left) && !assignedIndices.has(right)
    );
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

  // Keep empty seats clustered at the tail by shuffling only remaining students,
  // then filling movable seats in row order and leaving the rest null.
  const remainStudents = movableStudents.filter((id) => !usedIds.has(id));
  shuffleArray(remainStudents);
  const orderedMovableIndices = [...movableIndices].sort((a, b) => a - b);
  let pointer = 0;
  orderedMovableIndices.forEach((index) => {
    if (assignedIndices.has(index)) {
      return;
    }
    next[index] = pointer < remainStudents.length ? remainStudents[pointer] : null;
    if (pointer < remainStudents.length) {
      pointer += 1;
    }
  });

  fixedByIndex.forEach((value, index) => {
    next[index] = value;
  });
  return next;
}

function shuffleSeats() {
  const beforeOrder = [...state.seatOrder];
  const retries = Math.max(50, Number.parseInt(state.settings.constraints.maxRetries, 10) || 200);
  let bestOrder = null;
  let bestEval = null;
  let bestScore = Infinity;

  for (let i = 0; i < retries; i += 1) {
    const candidate = generateCandidateOrderFromCurrent();
    const result = evaluateShuffleOrder(candidate);
    const score = result.hardViolations * 1000 + result.softPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestOrder = candidate;
      bestEval = result;
    }
    if (score === 0) {
      break;
    }
  }

  if (bestOrder) {
    state.seatOrder = bestOrder;
    queueSeatFlash(getChangedSeatIndices(beforeOrder, state.seatOrder));
    if (bestEval && bestEval.hardViolations > 0) {
      showToast("约束过多，已给出最接近方案，请放宽约束。", "info");
    } else {
      showToast("随机调整已完成", "success");
    }
    saveState();
    renderSeatGrid();
  }
}

function computeComplementScore(studentA, studentB, rule) {
  if (!studentA || !studentB || !rule) {
    return 0;
  }
  const tagsA = new Set(getEffectiveTags(studentA));
  const tagsB = new Set(getEffectiveTags(studentB));
  const direct = tagsA.has(rule.leftTagId) && tagsB.has(rule.rightTagId);
  const reverse = tagsA.has(rule.rightTagId) && tagsB.has(rule.leftTagId);
  return direct || reverse ? 1 : 0;
}

function getSelectedComplementRuleIds() {
  if (!complementRuleList) {
    return [];
  }
  return Array.from(complementRuleList.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
}

function getSelectedComplementRules() {
  const ids = new Set(getSelectedComplementRuleIds());
  return COMPLEMENT_RULES.filter((rule) => ids.has(rule.id));
}

function refreshComplementRequiredOptions(selectedIds = getSelectedComplementRuleIds()) {
  if (!complementRuleSelect) {
    return;
  }
  const current = complementRuleSelect.value;
  complementRuleSelect.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "无（全部尽量满足）";
  complementRuleSelect.appendChild(none);
  COMPLEMENT_RULES.filter((rule) => selectedIds.includes(rule.id)).forEach((rule) => {
    const option = document.createElement("option");
    option.value = rule.id;
    option.textContent = rule.labelZh;
    complementRuleSelect.appendChild(option);
  });
  if (current && selectedIds.includes(current)) {
    complementRuleSelect.value = current;
  } else {
    complementRuleSelect.value = "";
  }
}

function generateComplementPairs(studentIds, rules, requiredRuleId = "") {
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const pairCandidates = [];
  const selectedRules = Array.isArray(rules) ? rules : [];
  const softRules = selectedRules.filter((rule) => rule.id !== requiredRuleId);
  for (let i = 0; i < studentIds.length; i += 1) {
    for (let j = i + 1; j < studentIds.length; j += 1) {
      const a = studentIds[i];
      const b = studentIds[j];
      const requiredMatch = requiredRuleId
        ? computeComplementScore(
            studentById.get(a),
            studentById.get(b),
            selectedRules.find((rule) => rule.id === requiredRuleId)
          )
        : 0;
      const softScore = softRules.reduce(
        (sum, rule) => sum + computeComplementScore(studentById.get(a), studentById.get(b), rule),
        0
      );
      pairCandidates.push({
        a,
        b,
        requiredMatch,
        softScore,
        totalScore: requiredMatch * 100 + softScore
      });
    }
  }
  const used = new Set();
  const selected = [];
  const pickPairs = (candidates) => {
    candidates.forEach((pair) => {
      if (used.has(pair.a) || used.has(pair.b)) {
        return;
      }
      used.add(pair.a);
      used.add(pair.b);
      selected.push(pair);
    });
  };
  if (requiredRuleId) {
    const requiredCandidates = pairCandidates
      .filter((pair) => pair.requiredMatch > 0)
      .sort((x, y) => y.softScore - x.softScore || (Math.random() < 0.5 ? -1 : 1));
    pickPairs(requiredCandidates);
  }
  pairCandidates
    .sort(
      (x, y) =>
        y.totalScore - x.totalScore ||
        y.requiredMatch - x.requiredMatch ||
        y.softScore - x.softScore ||
        (Math.random() < 0.5 ? -1 : 1)
    )
    .forEach((pair) => {
      if (used.has(pair.a) || used.has(pair.b)) {
        return;
      }
      used.add(pair.a);
      used.add(pair.b);
      selected.push(pair);
    });
  return {
    pairs: selected,
    requiredMatchedCount: selected.filter((item) => item.requiredMatch > 0).length,
    softMatchedCount: selected.filter((item) => item.softScore > 0).length
  };
}

function buildComplementSeatOrder(rules, options = {}) {
  const respectLocked = options.respectLocked !== false;
  const keepLockedEmpty = options.keepLockedEmpty !== false;
  const total = state.seatOrder.length;
  const next = [...state.seatOrder];
  const lockedSet = new Set(state.lockedSeats);
  const movableIndices = [];
  const fixedByIndex = new Map();

  for (let index = 0; index < total; index += 1) {
    const value = state.seatOrder[index] ?? null;
    if (respectLocked && lockedSet.has(index)) {
      if (value || keepLockedEmpty) {
        fixedByIndex.set(index, value);
        continue;
      }
    }
    movableIndices.push(index);
  }

  const movableStudents = movableIndices.map((index) => state.seatOrder[index]).filter(Boolean);
  const sortedMovableIndices = [...movableIndices].sort((a, b) => a - b);
  const studentSeatIndices = sortedMovableIndices.slice(0, movableStudents.length);
  const emptySeatIndices = sortedMovableIndices.slice(movableStudents.length);
  const {
    pairs,
    requiredMatchedCount,
    softMatchedCount
  } = generateComplementPairs(movableStudents, rules, options.requiredRuleId || "");
  const pairDeskSlots = getDeskPairsForSeatCount(total).filter(
    ([left, right]) => studentSeatIndices.includes(left) && studentSeatIndices.includes(right)
  );
  shuffleArray(pairDeskSlots);

  const assigned = new Set();
  let pairIndex = 0;
  for (let i = 0; i < pairDeskSlots.length && pairIndex < pairs.length; i += 1) {
    const [left, right] = pairDeskSlots[i];
    if (assigned.has(left) || assigned.has(right)) {
      continue;
    }
    const pair = pairs[pairIndex];
    pairIndex += 1;
    const swap = Math.random() < 0.5;
    next[left] = swap ? pair.b : pair.a;
    next[right] = swap ? pair.a : pair.b;
    assigned.add(left);
    assigned.add(right);
  }

  const usedStudents = new Set();
  assigned.forEach((seatIndex) => {
    if (next[seatIndex]) {
      usedStudents.add(next[seatIndex]);
    }
  });
  const remainingStudents = movableStudents.filter((id) => !usedStudents.has(id));
  const restIndices = studentSeatIndices.filter((index) => !assigned.has(index));
  shuffleArray(restIndices);
  shuffleArray(remainingStudents);
  let pointer = 0;
  restIndices.forEach((index) => {
    next[index] = pointer < remainingStudents.length ? remainingStudents[pointer] : null;
    if (pointer < remainingStudents.length) {
      pointer += 1;
    }
  });

  emptySeatIndices.forEach((index) => {
    next[index] = null;
  });

  fixedByIndex.forEach((value, index) => {
    next[index] = value;
  });

  return {
    order: next,
    pairCount: pairs.length,
    requiredMatchedCount,
    softMatchedCount
  };
}

function evaluateComplementConstraints(order, options = {}) {
  let softPenalty = 0;
  let hardViolations = 0;

  if (options.respectNoDesk) {
    const noDeskSet = new Set(
      state.settings.constraints.noDeskmatePairs.map((pair) => [pair.a, pair.b].sort().join("|"))
    );
    getDeskPairsForSeatCount(order.length).forEach(([left, right]) => {
      const leftId = order[left];
      const rightId = order[right];
      if (!leftId || !rightId) {
        return;
      }
      if (noDeskSet.has([leftId, rightId].sort().join("|"))) {
        hardViolations += 1;
      }
    });
  }

  if (options.respectLockedPairs) {
    (state.settings.constraints.lockedDeskmatePairs || []).forEach((pair) => {
      const leftIndex = order.indexOf(pair.a);
      const rightIndex = order.indexOf(pair.b);
      if (leftIndex !== -1 && rightIndex !== -1 && !areDeskmatesByIndex(leftIndex, rightIndex)) {
        hardViolations += 1;
      }
    });
  }

  if (options.respectFrontRows) {
    const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
    (state.settings.constraints.frontRowStudentIds || []).forEach((studentId) => {
      const seatIndex = order.indexOf(studentId);
      if (seatIndex !== -1 && Math.floor(seatIndex / COLS) >= frontRows) {
        hardViolations += 1;
      }
    });
  }

  if (options.pairByGender) {
    const idToGender = new Map(state.students.map((student) => [student.id, (student.gender || "").trim()]));
    getDeskPairsForSeatCount(order.length).forEach(([left, right]) => {
      const leftId = order[left];
      const rightId = order[right];
      if (!leftId || !rightId) {
        return;
      }
      const leftGender = idToGender.get(leftId);
      const rightGender = idToGender.get(rightId);
      if (leftGender && rightGender && leftGender === rightGender) {
        softPenalty += 1;
      }
    });
  }

  return { hardViolations, softPenalty };
}

function isBetterComplementCandidate(current, next) {
  if (!current) {
    return true;
  }
  if (next.eval.hardViolations !== current.eval.hardViolations) {
    return next.eval.hardViolations < current.eval.hardViolations;
  }
  if (next.requiredMatchedCount !== current.requiredMatchedCount) {
    return next.requiredMatchedCount > current.requiredMatchedCount;
  }
  if (next.softMatchedCount !== current.softMatchedCount) {
    return next.softMatchedCount > current.softMatchedCount;
  }
  if (next.eval.softPenalty !== current.eval.softPenalty) {
    return next.eval.softPenalty < current.eval.softPenalty;
  }
  return false;
}

function computeBestComplementPlacement() {
  const rules = getSelectedComplementRules();
  if (!rules.length) {
    return { error: "请至少勾选一条互补规则。" };
  }

  const requiredRuleId = complementRuleSelect?.value || "";
  const options = {
    respectLocked: Boolean(complementRespectLocked?.checked),
    keepLockedEmpty: Boolean(complementKeepLockedEmpty?.checked),
    requiredRuleId
  };
  const evalOptions = {
    respectNoDesk: Boolean(complementRespectNoDesk?.checked),
    respectFrontRows: Boolean(complementRespectFrontRows?.checked),
    respectLockedPairs: Boolean(complementRespectLockedPairs?.checked),
    pairByGender: Boolean(complementPairByGender?.checked)
  };

  let best = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = buildComplementSeatOrder(rules, options);
    const evaluation = evaluateComplementConstraints(result.order, evalOptions);
    const candidate = {
      ...result,
      eval: evaluation
    };
    if (isBetterComplementCandidate(best, candidate)) {
      best = candidate;
      if (
        best.eval.hardViolations === 0 &&
        best.eval.softPenalty === 0 &&
        (!requiredRuleId || best.requiredMatchedCount > 0)
      ) {
        break;
      }
    }
  }

  return best || { error: "未能生成排座结果。" };
}

function openComplementModal() {
  if (!complementModal) {
    return;
  }
  if (complementRuleList) {
    complementRuleList.innerHTML = "";
    COMPLEMENT_RULES.forEach((rule) => {
      const label = document.createElement("label");
      label.className = "complement-rule-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = rule.id;
      checkbox.addEventListener("change", () => {
        refreshComplementRequiredOptions();
      });
      const text = document.createElement("span");
      text.textContent = rule.labelZh;
      label.append(checkbox, text);
      complementRuleList.appendChild(label);
    });
  }
  refreshComplementRequiredOptions([]);
  complementRespectLocked.checked = true;
  complementKeepLockedEmpty.checked = Boolean(state.settings.keepLockedEmpty);
  if (complementPairByGender) {
    complementPairByGender.checked = Boolean(state.settings.pairByGender);
  }
  if (complementRespectNoDesk) {
    complementRespectNoDesk.checked = true;
  }
  if (complementRespectFrontRows) {
    complementRespectFrontRows.checked = true;
  }
  if (complementRespectLockedPairs) {
    complementRespectLockedPairs.checked = true;
  }
  complementStatus.textContent = "选择规则后直接应用。";
  complementPreviewOrder = null;
  complementModal.classList.remove("hidden");
  complementModal.setAttribute("aria-hidden", "false");
}

function closeComplementModal() {
  if (!complementModal) {
    return;
  }
  complementModal.classList.add("hidden");
  complementModal.setAttribute("aria-hidden", "true");
  complementPreviewOrder = null;
}

function previewComplementPlacement() {
  const result = computeBestComplementPlacement();
  if (result.error) {
    complementStatus.textContent = result.error;
    return;
  }
  complementPreviewOrder = result.order;
  const requiredText = complementRuleSelect?.value ? `，必须规则命中 ${result.requiredMatchedCount} 对` : "";
  const hint =
    result.eval.hardViolations > 0 ? `；仍有 ${result.eval.hardViolations} 项约束未完全满足，已取最优结果` : "";
  complementStatus.textContent = `已生成方案：形成 ${result.pairCount} 对同桌，互补匹配 ${result.softMatchedCount + result.requiredMatchedCount} 对${requiredText}${hint}。`;
}

function applyComplementPlacement() {
  const result = computeBestComplementPlacement();
  if (result.error) {
    complementStatus.textContent = result.error;
    return;
  }
  const before = [...state.seatOrder];
  state.seatOrder = [...result.order];
  queueSeatFlash(getChangedSeatIndices(before, state.seatOrder));
  saveState();
  renderSeatGrid();
  closeComplementModal();
  if (result.eval.hardViolations > 0) {
    showToast("互补标签排座已应用（部分约束未完全满足）", "info");
  } else {
    showToast("互补标签排座已应用", "success");
  }
}

function resetSeats() {
  let keepLocks = true;
  if (state.lockedSeats.length) {
    keepLocks = confirm("检测到锁定座位。点击“确定”保留锁定；点击“取消”清除锁定。");
  }
  const seatCount = getSeatCapacityFromCount(state.students.length);
  const order = new Array(seatCount).fill(null);
  state.students.forEach((student, index) => {
    if (index < seatCount) {
      order[index] = student.id;
    }
  });
  state.seatOrder = order;
  if (!keepLocks) {
    state.lockedSeats = [];
  } else {
    normalizeLocks();
  }
  saveState();
  renderSeatGrid();
}

function pickRandom(array, count) {
  const pool = [...array];
  const picked = [];
  const max = Math.min(count, pool.length);
  for (let i = 0; i < max; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return { picked, remaining: pool };
}

function resetDrawPool() {
  state.draw.used = [];
  saveState();
}

function clearDrawHistory() {
  state.draw.history = [];
  saveState();
}

function getRemainingPool() {
  const usedSet = new Set(state.draw.used);
  return state.students.map((student) => student.id).filter((id) => !usedSet.has(id));
}

function drawNames() {
  const count = Math.max(1, Number.parseInt(drawCount.value, 10) || 1);
  if (state.students.length === 0) {
    drawStatus.textContent = "暂无学生可抽签。";
    drawResults.innerHTML = "";
    return;
  }

  const isNoRepeat = noRepeat.checked;
  state.draw.noRepeat = isNoRepeat;

  const remainingPool = isNoRepeat ? getRemainingPool() : [];
  if (isNoRepeat && remainingPool.length === 0) {
    drawStatus.textContent = "去重池已空，请先重置抽签。";
    drawResults.innerHTML = "";
    return;
  }

  const source = isNoRepeat ? remainingPool : state.students.map((student) => student.id);
  const result = pickRandom(source, count);

  if (isNoRepeat) {
    state.draw.used = Array.from(new Set([...state.draw.used, ...result.picked]));
  }

  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const pickedStudents = result.picked.map((id) => studentById.get(id)).filter(Boolean);

  const names = pickedStudents.map((student) => student.name);

  state.draw.history.unshift({
    time: new Date().toISOString(),
    names
  });
  state.draw.history = state.draw.history.slice(0, 6);

  saveState();
  renderDrawResults();
  showToast("抽签完成", "success");
}

function renderDrawResults() {
  const isNoRepeat = Boolean(state.draw.noRepeat);

  if (state.students.length === 0) {
    drawStatus.textContent = "暂无学生可抽签。";
    drawResults.innerHTML = "";
    return;
  }

  if (isNoRepeat) {
    drawStatus.textContent = `去重池剩余：${getRemainingPool().length} 人`;
  } else {
    drawStatus.textContent = "非去重模式：每次抽签互不影响。";
  }

  drawResults.innerHTML = "";
  if (state.draw.history.length === 0) {
    return;
  }

  state.draw.history.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "draw-result-card";

    const title = document.createElement("h4");
    title.textContent = index === 0 ? "最新结果" : `历史记录 ${index + 1}`;

    const names = document.createElement("div");
    names.textContent = entry.names.length ? entry.names.join("、") : "无";

    card.append(title, names);
    drawResults.appendChild(card);
  });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const pad = (value) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getWeekKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function getWeekLabel(weekKey = getWeekKey(new Date())) {
  return weekKey ? `周起始 ${weekKey}` : "本周";
}

function formatDateForFilename(date = new Date()) {
  const pad = (value) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shouldShowBackupReminder() {
  if (!state.lastBackupAt) {
    return true;
  }
  const last = new Date(state.lastBackupAt).getTime();
  if (Number.isNaN(last)) {
    return true;
  }
  const delta = Date.now() - last;
  return delta > 7 * 24 * 60 * 60 * 1000;
}

function renderBackupInfo() {
  if (backupInfo) {
    backupInfo.textContent = `上次备份：${formatDateTimeLocal(state.lastBackupAt)}`;
  }
  if (!backupReminder || !backupReminderText) {
    return;
  }
  if (shouldShowBackupReminder()) {
    backupReminder.classList.remove("hidden");
    backupReminderText.textContent = `建议导出备份（上次备份：${formatDateTimeLocal(state.lastBackupAt)}）`;
    if (!backupReminderChecked) {
      showToast("建议导出备份", "info");
      backupReminderChecked = true;
    }
  } else {
    backupReminder.classList.add("hidden");
  }
}

function pruneSeatHistory() {
  state.seatHistory = state.seatHistory
    .filter((item) => item && Array.isArray(item.seats))
    .map((item) => {
      const seats = Array.isArray(item.seats) ? [...item.seats] : [];
      const seatCount = item.rows ? item.rows * COLS : getSeatCapacityFromCount(seats.length);
      if (seatCount && seats.length > seatCount) {
        seats.length = seatCount;
      }
      while (seats.length < seatCount) {
        seats.push("");
      }
      const rows = item.rows || getRowCountFromSeatCount(seatCount);
      return {
        ...item,
        note: (item.note || "").toString().trim(),
        seats,
        rows
      };
    })
    .slice(0, 20);
}

function saveCurrentSeatHistory() {
  if (state.students.length === 0) {
    return;
  }
  const noteInput = prompt("请输入本次历史快照备注（可留空）：", "") || "";
  const studentById = new Map(state.students.map((item) => [item.id, item]));
  const rowCount = getRowCount();
  const snapshot = {
    id: uid(),
    time: new Date().toISOString(),
    note: noteInput.trim(),
    rows: rowCount,
    seats: state.seatOrder.map((id) => {
      const student = studentById.get(id);
      return student ? student.name : "";
    })
  };
  state.seatHistory.unshift(snapshot);
  pruneSeatHistory();
  saveState();
  renderHistoryList();
  showToast("历史座位已保存", "success");
}

function renderHistoryList() {
  historyList.innerHTML = "";
  const keyword = (historyFilterInput?.value || "").trim();
  const filtered = keyword
    ? state.seatHistory.filter((item) => (item.note || "").includes(keyword))
    : state.seatHistory;
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = keyword ? "没有匹配备注的历史记录。" : "暂无历史座位记录。";
    historyList.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const count = item.seats.filter((name) => name).length;
    const noteText = item.note ? item.note : "（无备注）";
    meta.textContent = `${formatDateTime(item.time)} · ${noteText} · ${count} 人`;

    const actions = document.createElement("div");
    actions.className = "seat-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "ghost";
    viewBtn.textContent = "查看";
    viewBtn.addEventListener("click", () => openHistoryModal(item));

    const applyBtn = document.createElement("button");
    applyBtn.className = "primary";
    applyBtn.textContent = "应用";
    applyBtn.addEventListener("click", () => {
      if (confirm("确定将该历史座位应用到当前座位吗？")) {
        applyHistorySnapshot(item);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      if (confirm("确定删除该历史记录吗？")) {
        state.seatHistory = state.seatHistory.filter((snap) => snap.id !== item.id);
        saveState();
        renderHistoryList();
      }
    });

    actions.append(viewBtn, applyBtn, deleteBtn);
    row.append(meta, actions);
    historyList.appendChild(row);
  });
}

function applyHistorySnapshot(snapshot) {
  const beforeOrder = [...state.seatOrder];
  const nameQueues = new Map();
  state.students.forEach((student) => {
    const key = normalizeName(student.name);
    if (!nameQueues.has(key)) {
      nameQueues.set(key, []);
    }
    nameQueues.get(key).push(student.id);
  });

  const order = snapshot.seats.map((name) => {
    if (!name) {
      return null;
    }
    const key = normalizeName(name);
    const queue = nameQueues.get(key);
    if (queue && queue.length) {
      return queue.shift();
    }
    return null;
  });

  state.seatOrder = order;
  queueSeatFlash(getChangedSeatIndices(beforeOrder, state.seatOrder));
  saveState();
  renderAll();
  showToast("已应用历史座位", "success");
}

function openHistoryModal(snapshot) {
  const noteText = snapshot.note ? ` · ${snapshot.note}` : " · （无备注）";
  historyTitle.textContent = `历史座位表 · ${formatDateTime(snapshot.time)}${noteText}`;
  renderHistoryGrid(snapshot.seats, snapshot.rows);
  historyModal.classList.remove("hidden");
  historyModal.setAttribute("aria-hidden", "false");
}

function closeHistoryModal() {
  historyModal.classList.add("hidden");
  historyModal.setAttribute("aria-hidden", "true");
}

function openExportModal() {
  if (!activeStudentId) {
    return;
  }
  exportOptScores.checked = true;
  exportOptRecords.checked = true;
  exportOptNotes.checked = true;
  exportModal.classList.remove("hidden");
  exportModal.setAttribute("aria-hidden", "false");
}

function closeExportModal() {
  exportModal.classList.add("hidden");
  exportModal.setAttribute("aria-hidden", "true");
}

function exportStudentDataSelection() {
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student) {
    showToast("未找到学生", "error");
    return;
  }
  const includeScores = Boolean(exportOptScores.checked);
  const includeRecords = Boolean(exportOptRecords.checked);
  const includeNotes = Boolean(exportOptNotes.checked);
  if (!includeScores && !includeRecords && !includeNotes) {
    showToast("请至少选择一项导出内容", "error");
    return;
  }

  const lines = [];
  lines.push(`学生：${student.name}`);
  lines.push(`导出时间：${new Date().toLocaleString()}`);
  const selectedLabels = [];
  if (includeScores) {
    selectedLabels.push("成绩");
  }
  if (includeRecords) {
    selectedLabels.push("奖惩");
  }
  if (includeNotes) {
    selectedLabels.push("备注");
  }
  lines.push(`导出内容：${selectedLabels.join("、")}`);
  lines.push("");

  if (includeScores) {
    lines.push("【成绩记录】");
    const exams = Array.isArray(student.exams) ? [...student.exams] : [];
    if (!exams.length) {
      lines.push("无成绩记录");
    } else {
      exams.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      exams.forEach((exam) => {
        const title = `${exam.date || ""} ${exam.name || "考试"}`.trim();
        lines.push(`- ${title}`);
        const subjects = exam.subjects || [];
        if (!subjects.length) {
          lines.push("  (无科目成绩)");
        } else {
          subjects.forEach((subject) => {
            const data = exam.scores?.[subject];
            const parts = [];
            const score = parseScoreValue(data);
            if (Number.isFinite(score)) {
              parts.push(`分数 ${score}`);
            }
            if (data && typeof data === "object") {
              if (Number.isInteger(data.rankClass)) {
                parts.push(`班排 ${data.rankClass}`);
              }
              if (Number.isInteger(data.rankSchool)) {
                parts.push(`校排 ${data.rankSchool}`);
              }
            }
            lines.push(`  ${subject}：${parts.length ? parts.join(" / ") : "-"}`);
          });
        }
        if (exam.total && (Number.isFinite(exam.total.score) || Number.isInteger(exam.total.rankClass) || Number.isInteger(exam.total.rankSchool))) {
          const totalParts = [];
          if (Number.isFinite(exam.total.score)) {
            totalParts.push(`总分 ${exam.total.score}`);
          }
          if (Number.isInteger(exam.total.rankClass)) {
            totalParts.push(`总班排 ${exam.total.rankClass}`);
          }
          if (Number.isInteger(exam.total.rankSchool)) {
            totalParts.push(`总校排 ${exam.total.rankSchool}`);
          }
          lines.push(`  ${totalParts.join(" / ")}`);
        }
      });
    }
    lines.push("");
  }

  const records = Array.isArray(student.records) ? student.records : [];
  if (includeRecords) {
    lines.push("【奖惩记录（奖/罚）】");
    const rewardPunish = records.filter((record) => record.type === "奖" || record.type === "罚");
    if (!rewardPunish.length) {
      lines.push("无奖惩记录");
    } else {
      rewardPunish.forEach((record) => {
        lines.push(
          `${record.date || ""} [${record.type}] ${record.note || "（无内容）"}（${getWeekLabel(
            record.weekKey || getWeekKey(record.date)
          )}）`
        );
      });
    }
    lines.push("");
  }

  if (includeNotes) {
    lines.push("【备注记录】");
    const noteRecords = records.filter((record) => record.type === "备注");
    if (!noteRecords.length) {
      lines.push("无备注记录");
    } else {
      noteRecords.forEach((record) => {
        lines.push(
          `${record.date || ""} ${record.note || "（无内容）"}（${getWeekLabel(
            record.weekKey || getWeekKey(record.date)
          )}）`
        );
      });
    }
    lines.push("");
  }

  const filename = `${student.name}_导出_${formatDateForFilename()}.txt`;
  downloadTextFile(filename, lines.join("\n"));
  closeExportModal();
  showToast("学生数据已导出", "success");
}

function renderHistoryGrid(seats, rowsOverride) {
  historyGridInner.innerHTML = "";
  const seatCount = seats.length;
  const rows = rowsOverride || getRowCountFromSeatCount(seatCount);
  if (!rows) {
    return;
  }

  const blank = document.createElement("div");
  historyGridInner.appendChild(blank);
  for (let col = 1; col <= COLS; col += 1) {
    const header = document.createElement("div");
    header.className = "history-header";
    header.textContent = `第${col}列`;
    historyGridInner.appendChild(header);
  }

  for (let row = 1; row <= rows; row += 1) {
    const rowLabel = document.createElement("div");
    rowLabel.className = "history-row-label";
    rowLabel.textContent = `第${row}行`;
    historyGridInner.appendChild(rowLabel);

    for (let col = 1; col <= COLS; col += 1) {
      const index = (row - 1) * COLS + (col - 1);
      const cell = document.createElement("div");
      cell.className = "history-seat";
      cell.textContent = seats[index] || "空";
      const label = document.createElement("span");
      label.textContent = `${row}-${col}`;
      cell.appendChild(label);
      historyGridInner.appendChild(cell);
    }
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(cell);
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.map((cells) => cells.map((item) => item.trim()));
}

function detectColumn(header, keywords) {
  const lower = header.map((cell) => cell.toString().trim().toLowerCase());
  return lower.findIndex((cell) => keywords.some((keyword) => cell.includes(keyword)));
}

function parseSpreadsheetRows(rows) {
  if (!rows.length) {
    return { names: [], placements: [], genders: [], hasPlacement: false, hasGender: false };
  }

  const header = rows[0];
  const nameCol = detectColumn(header, ["姓名", "名字", "name", "学生"]);
  const rowCol = detectColumn(header, ["行", "row"]);
  const colCol = detectColumn(header, ["列", "col"]);
  const genderCol = detectColumn(header, ["性别", "gender"]);

  const startIndex = nameCol !== -1 || rowCol !== -1 || colCol !== -1 ? 1 : 0;
  const placements = [];
  const genders = [];
  const names = [];
  const genderList = [];
  let hasPlacement = false;
  let hasGender = false;
  let maxIndex = -1;

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = nameCol !== -1 ? row[nameCol] : row[0];
    const name = rawName ? rawName.toString().trim() : "";
    if (!name) {
      continue;
    }

    const rawRow = rowCol !== -1 ? row[rowCol] : "";
    const rawCol = colCol !== -1 ? row[colCol] : "";
    const rawGender = genderCol !== -1 ? row[genderCol] : "";
    const gender = rawGender ? rawGender.toString().trim() : "";
    const rowIndex = Number.parseInt(rawRow, 10);
    const colIndex = Number.parseInt(rawCol, 10);

    if (
      Number.isInteger(rowIndex) &&
      Number.isInteger(colIndex) &&
      rowIndex >= 1 &&
      colIndex >= 1 &&
      colIndex <= COLS
    ) {
      const index = (rowIndex - 1) * COLS + (colIndex - 1);
      if (index > maxIndex) {
        maxIndex = index;
      }
      placements[index] = name;
      genders[index] = gender;
      hasPlacement = true;
      if (gender) {
        hasGender = true;
      }
    } else {
      names.push(name);
      genderList.push(gender);
      if (gender) {
        hasGender = true;
      }
    }
  }

  if (hasPlacement) {
    const seatCount = getSeatCapacityFromCount(maxIndex + 1);
    for (let i = 0; i < seatCount; i += 1) {
      if (placements[i] === undefined) {
        placements[i] = null;
      }
      if (genders[i] === undefined) {
        genders[i] = "";
      }
    }
  }

  return { names, placements, genders, genderList, hasPlacement, hasGender };
}

function applyImportData(data, replaceExisting) {
  const { names, placements, genders, genderList, hasPlacement } = data;
  const incomingNames = [...names];

  normalizeSeatOrder();

  if (!incomingNames.length && !hasPlacement) {
    importStatus.textContent = "没有识别到学生姓名，请检查文件格式。";
    return false;
  }

  if (replaceExisting) {
    const students = [];
    const sourceNames = hasPlacement ? placements : [];
    const placementCount = sourceNames.filter((name) => name).length;
    const totalCount = placementCount + incomingNames.filter((name) => name).length;
    const seatCount = Math.max(placements.length || 0, getSeatCapacityFromCount(totalCount));
    const seatOrder = new Array(seatCount).fill(null);

    sourceNames.forEach((name, index) => {
      if (!name) {
        return;
      }
      const gender = genders[index] || "";
      const student = { id: uid(), name, gender, aliases: [], records: [], manualTags: [], autoTags: [], exams: [] };
      students.push(student);
      if (index < seatOrder.length) {
        seatOrder[index] = student.id;
      }
    });

    incomingNames.forEach((name, index) => {
      if (!name) {
        return;
      }
      const gender = genderList[index] || "";
      const student = { id: uid(), name, gender, aliases: [], records: [], manualTags: [], autoTags: [], exams: [] };
      students.push(student);
      const emptyIndex = seatOrder.indexOf(null);
      if (emptyIndex !== -1) {
        seatOrder[emptyIndex] = student.id;
      }
    });

    state.students = students;
    state.seatOrder = seatOrder;
    state.draw.used = [];
    state.draw.history = [];
    state.seatHistory = [];
    state.exams = [];
  } else {
    if (hasPlacement) {
      importStatus.textContent = "检测到行列信息：追加模式下将忽略座位位置，仅追加名单。";
    }
    const targetCount = getSeatCapacityFromCount(state.students.length + incomingNames.length);
    if (targetCount > state.seatOrder.length) {
      const extra = new Array(targetCount - state.seatOrder.length).fill(null);
      state.seatOrder = [...state.seatOrder, ...extra];
    }
    const available = state.seatOrder.filter((item) => item === null).length;
    let added = 0;
    incomingNames.forEach((name, index) => {
      if (!name) {
        return;
      }
      const gender = genderList[index] || "";
      const student = { id: uid(), name, gender, aliases: [], records: [], manualTags: [], autoTags: [], exams: [] };
      state.students.push(student);
      placeStudentInFirstEmpty(student.id);
      added += 1;
    });

    if (!added) {
      importStatus.textContent = "没有新增学生。";
      return false;
    }

    if (added > available) {
      importStatus.textContent = "部分学生未能追加：座位数量不足。";
    }
  }

  normalizeSeatOrder();
  normalizeLocks();
  saveState();
  renderAll();
  showToast("名单导入成功", "success");
  showDuplicateNameWarning("导入后");
  return true;
}

function importFile(file) {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isCsv) {
    file
      .text()
      .then((text) => {
        const rows = parseCSV(text);
        const data = parseSpreadsheetRows(rows);
        if (applyImportData(data, importReplace.checked)) {
          importStatus.textContent = "导入成功。";
        }
      })
      .catch(() => {
        importStatus.textContent = "读取文件失败，请重试。";
      });
    return;
  }

  if (isExcel) {
    if (!window.XLSX) {
      importStatus.textContent = "未加载 Excel 解析库，请联网或改用 CSV。";
      return;
    }
    file
      .arrayBuffer()
      .then((buffer) => {
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const data = parseSpreadsheetRows(rows);
        if (applyImportData(data, importReplace.checked)) {
          importStatus.textContent = "导入成功。";
        }
      })
      .catch(() => {
        importStatus.textContent = "读取 Excel 失败，请确认文件无损。";
      });
    return;
  }

  importStatus.textContent = "暂不支持该文件格式，请使用 .xlsx 或 .csv。";
}

function csvEscape(value) {
  const str = value ? value.toString() : "";
  if (str.includes("\"") || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/\"/g, "\"\"")}"`;
  }
  return str;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportSeatsCsv() {
  const header = [
    "行",
    "第1列",
    "第2列",
    "",
    "第3列",
    "第4列",
    "",
    "第5列",
    "第6列",
    "",
    "第7列",
    "第8列"
  ];
  const nameMap = new Map(state.students.map((student) => [student.id, student.name]));
  const lines = [];
  lines.push(header.map(csvEscape).join(","));

  const rows = getRowCount();
  for (let row = 0; row < rows; row += 1) {
    const rowNames = [];
    for (let col = 0; col < COLS; col += 1) {
      const index = row * COLS + col;
      const id = state.seatOrder[index];
      rowNames.push(nameMap.get(id) || "");
    }
    const grouped = [
      rowNames[0],
      rowNames[1],
      "",
      rowNames[2],
      rowNames[3],
      "",
      rowNames[4],
      rowNames[5],
      "",
      rowNames[6],
      rowNames[7]
    ];
    lines.push([row + 1, ...grouped].map(csvEscape).join(","));
  }

  const content = `\ufeff${lines.join("\n")}`;
  const filename = `座位表_${formatDateForFilename()}.csv`;
  downloadFile(filename, content);
  showToast("座位表已导出", "success");
}

function exportBackupJson() {
  const exportedAt = new Date().toISOString();
  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
    data: state
  };
  const filename = `classroom_backup_${formatDateForFilename()}_${new Date()
    .toTimeString()
    .slice(0, 5)
    .replace(":", "")}.json`;
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  state.lastBackupAt = exportedAt;
  saveState();
  renderBackupInfo();
  showToast("备份已导出", "success");
}

function importBackupJson(file) {
  file
    .text()
    .then((text) => {
      const parsed = JSON.parse(text);
      const version = parsed.version ?? 0;
      const data = parsed.data || parsed;
      if (!data || typeof data !== "object") {
        throw new Error("invalid");
      }
      if (!Array.isArray(data.students) || !Array.isArray(data.seatOrder)) {
        throw new Error("invalid");
      }
      const needsConfirm = true;
      const versionNotice =
        version && version !== BACKUP_VERSION
          ? `备份版本 ${version} 与当前版本 ${BACKUP_VERSION} 不同，仍尝试兼容导入。`
          : "";
      const confirmMsg = `${versionNotice}\n将覆盖当前数据，是否继续？`;
      if (needsConfirm && !confirm(confirmMsg.trim())) {
        return;
      }
      state = data;
      normalizeState();
      saveState();
      backupReminderChecked = false;
      renderAll();
      showToast("备份已导入", "success");
    })
    .catch(() => {
      showToast("备份导入失败", "error");
    });
}

function normalizeScoreHeaderValue(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "");
}

function detectSubjectFromHeader(header) {
  const normalized = normalizeScoreHeaderValue(header);
  const mapping = [
    { subject: "语文", pattern: /语文|chinese|^cn$/ },
    { subject: "数学", pattern: /数学|math|mathematics/ },
    { subject: "英语", pattern: /英语|英文|english|^en$/ },
    { subject: "物理", pattern: /物理|physics/ },
    { subject: "化学", pattern: /化学|chemistry/ },
    { subject: "地理", pattern: /地理|geography/ },
    { subject: "历史", pattern: /历史|history/ },
    { subject: "政治", pattern: /政治|思政|道法|politics/ },
    { subject: "生物", pattern: /生物|biology/ }
  ];
  const hit = mapping.find((item) => item.pattern.test(normalized));
  return hit ? hit.subject : "";
}

function isScoreHeader(header) {
  const normalized = normalizeScoreHeaderValue(header);
  if (!normalized) {
    return false;
  }
  const hasSubject = Boolean(detectSubjectFromHeader(normalized));
  const isTotal = /总分|总成绩|totalscore|overall/.test(normalized);
  if (!hasSubject && !isTotal) {
    return false;
  }
  return !/班排|班级排名|班级名次|校排|校排名|校级排名|schoolrank|classrank|名次|位次/.test(normalized);
}

function isClassRankHeader(header) {
  return /班名|班排|班级排名|班级名次|classrank/.test(normalizeScoreHeaderValue(header));
}

function isSchoolRankHeader(header) {
  return /校名|校排|校级|校排名|校级排名|schoolrank/.test(normalizeScoreHeaderValue(header));
}

function parseScoreNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(value.toString().replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRankNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const match = value.toString().replace(/,/g, "").match(/-?\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function detectScoreMapping(rows) {
  if (!rows.length) {
    return {
      reliable: false,
      reason: "empty",
      headers: [],
      nameCol: -1,
      subjectMappings: [],
      totalMapping: { scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 },
      conflicts: ["文件为空，无法识别列"],
      candidatesBySubject: {}
    };
  }

  const rawHeaders = rows[0].map((cell) => cell.toString().trim());
  const headers = rawHeaders.map((cell) => normalizeScoreHeaderValue(cell));
  const nameCol = rawHeaders.findIndex((cell, index) => {
    const normalized = headers[index];
    return /姓名|名字|学生/.test(normalized);
  });
  const conflicts = [];
  const candidatesBySubject = {};
  SUBJECT_ORDER.forEach((item) => {
    candidatesBySubject[item] = [];
  });
  const subjectMappingsMap = new Map(
    SUBJECT_ORDER.map((subject) => [subject, { subject, scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }])
  );
  const totalMapping = { scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 };
  let currentScope = "";

  rawHeaders.forEach((header, index) => {
    if (!header || index === nameCol) {
      return;
    }
    if (/学号|考号|准考证|考场|座位|组别|年级|性别|备注|缺考|缺席/.test(headers[index])) {
      return;
    }
    const subject = detectSubjectFromHeader(header);
    const isTotal = /总分|总成绩|totalscore|overall/.test(headers[index]);

    if ((subject || isTotal) && isScoreHeader(header)) {
      if (subject) {
        const item = subjectMappingsMap.get(subject);
        if (item.scoreCol !== -1) {
          conflicts.push(`${subject}分数列重复：${rawHeaders[item.scoreCol]}、${header}`);
        }
        item.scoreCol = index;
        candidatesBySubject[subject].push({ index, score: 100, header: rawHeaders[index] || `第${index + 1}列` });
        currentScope = subject;
      } else {
        if (totalMapping.scoreCol !== -1) {
          conflicts.push(`总分列重复：${rawHeaders[totalMapping.scoreCol]}、${header}`);
        }
        totalMapping.scoreCol = index;
        currentScope = "__total__";
      }
      return;
    }

    if (isClassRankHeader(header)) {
      if (currentScope === "__total__") {
        if (totalMapping.rankClassCol === -1) {
          totalMapping.rankClassCol = index;
        }
      } else if (currentScope && subjectMappingsMap.has(currentScope)) {
        const item = subjectMappingsMap.get(currentScope);
        if (item.rankClassCol === -1) {
          item.rankClassCol = index;
        }
      }
      return;
    }

    if (isSchoolRankHeader(header)) {
      if (currentScope === "__total__") {
        if (totalMapping.rankSchoolCol === -1) {
          totalMapping.rankSchoolCol = index;
        }
      } else if (currentScope && subjectMappingsMap.has(currentScope)) {
        const item = subjectMappingsMap.get(currentScope);
        if (item.rankSchoolCol === -1) {
          item.rankSchoolCol = index;
        }
      }
    }
  });
  const subjectMappings = Array.from(subjectMappingsMap.values()).filter((item) => item.scoreCol !== -1);

  if (nameCol === -1) {
    conflicts.push("未识别到姓名列");
  }
  if (subjectMappings.length === 0) {
    conflicts.push("未识别到可用科目列");
  }

  const reliable = nameCol !== -1 && subjectMappings.length > 0 && conflicts.length === 0;
  return {
    reliable,
    reason: reliable ? "ok" : "unreliable",
    headers: rawHeaders,
    nameCol,
    subjectMappings,
    totalMapping,
    conflicts,
    candidatesBySubject
  };
}

function parseScoreRowsWithMapping(rows, mapping) {
  const entries = [];
  const subjectMappings = mapping.subjectMappings || [];
  const subjects = subjectMappings.map((item) => item.subject);
  const nameCol = mapping.nameCol;
  const totalMapping = mapping.totalMapping || { scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 };
  const startIndex = rows.length ? 1 : 0;

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = nameCol !== -1 ? row[nameCol] : row[0];
    const name = rawName ? rawName.toString().trim() : "";
    if (!name) {
      continue;
    }

    const scores = {};
    subjectMappings.forEach(({ subject, scoreCol, rankClassCol, rankSchoolCol }) => {
      scores[subject] = {
        score: scoreCol >= 0 ? parseScoreNumber(row[scoreCol]) : null,
        rankClass: rankClassCol >= 0 ? parseRankNumber(row[rankClassCol]) : null,
        rankSchool: rankSchoolCol >= 0 ? parseRankNumber(row[rankSchoolCol]) : null
      };
    });

    const total = {
      score: totalMapping.scoreCol >= 0 ? parseScoreNumber(row[totalMapping.scoreCol]) : null,
      rankClass: totalMapping.rankClassCol >= 0 ? parseRankNumber(row[totalMapping.rankClassCol]) : null,
      rankSchool: totalMapping.rankSchoolCol >= 0 ? parseRankNumber(row[totalMapping.rankSchoolCol]) : null
    };

    entries.push({ name, scores, total });
  }

  return { subjects, entries };
}

function getStudentExamsForAutoTag(student, settings) {
  const exams = Array.isArray(student.exams) ? [...student.exams] : [];
  exams.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (settings.rangeMode === "recent") {
    return exams.slice(0, settings.recentN);
  }
  return exams;
}

function computeSubjectAverages(settings) {
  const averagesBySubject = {};
  Object.keys(ACADEMIC_SUBJECT_GROUP).forEach((subject) => {
    averagesBySubject[subject] = [];
  });

  state.students.forEach((student) => {
    const exams = getStudentExamsForAutoTag(student, settings);
    const scoreBucket = {};
    Object.keys(ACADEMIC_SUBJECT_GROUP).forEach((subject) => {
      scoreBucket[subject] = [];
    });
    exams.forEach((exam) => {
      Object.keys(ACADEMIC_SUBJECT_GROUP).forEach((subject) => {
        const val = parseScoreValue(exam.scores?.[subject]);
        if (Number.isFinite(val)) {
          scoreBucket[subject].push(val);
        }
      });
    });

    Object.keys(scoreBucket).forEach((subject) => {
      const list = scoreBucket[subject];
      if (!list.length) {
        return;
      }
      const avg = list.reduce((sum, item) => sum + item, 0) / list.length;
      averagesBySubject[subject].push({ studentId: student.id, avg });
    });
  });
  return averagesBySubject;
}

function recomputeAcademicAutoTags(showToastMessage = false) {
  const settings = getAutoAcademicSettings();
  state.settings.autoAcademic = settings;

  state.students.forEach((student) => {
    ensureStudentTagFields(student);
    ACADEMIC_TAG_GROUPS.forEach((group) => {
      setStudentAutoGroupTag(student, group.id, "");
    });
  });

  const bySubject = computeSubjectAverages(settings);
  Object.entries(bySubject).forEach(([subject, list]) => {
    if (!list.length) {
      return;
    }
    list.sort((a, b) => b.avg - a.avg);
    const strongCount = Math.min(settings.topN, list.length);
    const strongIds = new Set(list.slice(0, strongCount).map((item) => item.studentId));
    const weakIds = new Set();
    for (let i = list.length - 1; i >= 0 && weakIds.size < settings.bottomN; i -= 1) {
      const candidate = list[i].studentId;
      if (!strongIds.has(candidate)) {
        weakIds.add(candidate);
      }
    }

    list.forEach((item) => {
      const student = state.students.find((entry) => entry.id === item.studentId);
      if (!student) {
        return;
      }
      if (strongIds.has(item.studentId)) {
        setStudentAutoGroupTag(student, ACADEMIC_SUBJECT_GROUP[subject], getTagIdByLevel(subject, "strong"));
        return;
      }
      if (weakIds.has(item.studentId)) {
        setStudentAutoGroupTag(student, ACADEMIC_SUBJECT_GROUP[subject], getTagIdByLevel(subject, "weak"));
        return;
      }
      if (settings.includeMid) {
        setStudentAutoGroupTag(student, ACADEMIC_SUBJECT_GROUP[subject], getTagIdByLevel(subject, "mid"));
      }
    });
  });

  saveState();
  renderSeatGrid();
  renderSearchResults();
  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderTagEditor(student);
    }
  }
  if (autoAcademicStatus) {
    autoAcademicStatus.textContent = "学科自动标签已更新。";
  }
  if (showToastMessage) {
    showToast("学科标签已重新计算", "success");
  }
}

function renderAutoAcademicSettings() {
  if (!autoAcademicEnabled) {
    return;
  }
  const settings = getAutoAcademicSettings();
  autoAcademicEnabled.checked = settings.enabled;
  autoAcademicRangeMode.value = settings.rangeMode;
  autoAcademicRecentN.value = String(settings.recentN);
  autoAcademicTopN.value = String(settings.topN);
  autoAcademicBottomN.value = String(settings.bottomN);
  autoAcademicIncludeMid.checked = settings.includeMid;
  autoAcademicRecentWrap.classList.toggle("hidden", settings.rangeMode !== "recent");
}

function renderExamManager() {
  if (!existingExamSelect) {
    return;
  }
  const currentValue = existingExamSelect.value;
  existingExamSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择已保存考试";
  existingExamSelect.appendChild(placeholder);

  const exams = Array.isArray(state.exams) ? [...state.exams] : [];
  exams
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .forEach((exam) => {
      const option = document.createElement("option");
      option.value = exam.id;
      option.textContent = `${exam.date || ""} ${exam.name || "考试"}`.trim();
      existingExamSelect.appendChild(option);
    });

  if (currentValue && exams.some((exam) => exam.id === currentValue)) {
    existingExamSelect.value = currentValue;
  }
}

function removeExamGlobally(examId) {
  if (!examId) {
    return false;
  }
  let removed = false;
  state.students.forEach((student) => {
    if (!Array.isArray(student.exams)) {
      return;
    }
    const before = student.exams.length;
    student.exams = student.exams.filter((exam) => exam.id !== examId);
    if (student.exams.length !== before) {
      removed = true;
    }
  });
  state.exams = (state.exams || []).filter((exam) => exam.id !== examId);
  return removed;
}

function openMappingModal(headers, suggestion) {
  mappingList.innerHTML = "";
  if (mappingConflicts) {
    mappingConflicts.innerHTML = "";
    const conflicts = suggestion?.conflicts || [];
    if (conflicts.length) {
      conflicts.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        mappingConflicts.appendChild(li);
      });
      mappingConflicts.classList.remove("hidden");
    } else {
      mappingConflicts.classList.add("hidden");
    }
  }
  const nameRow = document.createElement("div");
  nameRow.className = "mapping-row mapping-row-name";
  const nameLabel = document.createElement("div");
  nameLabel.textContent = "姓名列";
  const nameSelect = document.createElement("select");
  nameSelect.dataset.role = "name";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "请选择";
  nameSelect.appendChild(placeholder);
  headers.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = header || `第${index + 1}列`;
    if (suggestion && suggestion.nameCol === index) {
      option.selected = true;
    }
    nameSelect.appendChild(option);
  });
  nameRow.append(nameLabel, nameSelect);
  mappingList.appendChild(nameRow);

  SUBJECT_ORDER.forEach((subject) => {
    const row = document.createElement("div");
    row.className = "mapping-row mapping-row-subject";
    const label = document.createElement("div");
    label.textContent = subject;
    const scoreSelect = document.createElement("select");
    scoreSelect.dataset.subject = subject;
    scoreSelect.dataset.field = "score";
    const classSelect = document.createElement("select");
    classSelect.dataset.subject = subject;
    classSelect.dataset.field = "rankClass";
    const schoolSelect = document.createElement("select");
    schoolSelect.dataset.subject = subject;
    schoolSelect.dataset.field = "rankSchool";

    const makeOptions = (select, emptyLabel, selectedIndex) => {
      const none = document.createElement("option");
      none.value = "";
      none.textContent = emptyLabel;
      select.appendChild(none);
      headers.forEach((header, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = header || `第${index + 1}列`;
        if (selectedIndex === index) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    };

    const item = suggestion?.subjectMappings?.find((entry) => entry.subject === subject);
    makeOptions(scoreSelect, "分数列", item?.scoreCol);
    makeOptions(classSelect, "班排列（可选）", item?.rankClassCol);
    makeOptions(schoolSelect, "校排列（可选）", item?.rankSchoolCol);

    row.append(label, scoreSelect, classSelect, schoolSelect);
    mappingList.appendChild(row);
  });

  const totalRow = document.createElement("div");
  totalRow.className = "mapping-row mapping-row-subject";
  const totalLabel = document.createElement("div");
  totalLabel.textContent = "总分";
  const totalScoreSelect = document.createElement("select");
  totalScoreSelect.dataset.role = "total-score";
  const totalClassSelect = document.createElement("select");
  totalClassSelect.dataset.role = "total-class";
  const totalSchoolSelect = document.createElement("select");
  totalSchoolSelect.dataset.role = "total-school";
  const buildSelect = (select, emptyLabel, selectedIndex) => {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = emptyLabel;
    select.appendChild(none);
    headers.forEach((header, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = header || `第${index + 1}列`;
      if (selectedIndex === index) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  };
  buildSelect(totalScoreSelect, "总分列（可选）", suggestion?.totalMapping?.scoreCol);
  buildSelect(totalClassSelect, "总班排（可选）", suggestion?.totalMapping?.rankClassCol);
  buildSelect(totalSchoolSelect, "总校排（可选）", suggestion?.totalMapping?.rankSchoolCol);
  totalRow.append(totalLabel, totalScoreSelect, totalClassSelect, totalSchoolSelect);
  mappingList.appendChild(totalRow);

  mappingModal.classList.remove("hidden");
  mappingModal.setAttribute("aria-hidden", "false");
}

function closeMappingModal() {
  mappingModal.classList.add("hidden");
  mappingModal.setAttribute("aria-hidden", "true");
  mappingState = null;
}

function applyExamDraft() {
  if (!examDraft) {
    return;
  }

  const replacingExam =
    scoreImportContext.mode === "replace" && scoreImportContext.examId
      ? (state.exams || []).find((exam) => exam.id === scoreImportContext.examId)
      : null;
  const examName = scoreExamName.value.trim() || replacingExam?.name || "考试";
  const examDate = scoreExamDate.value || replacingExam?.date || new Date().toISOString().slice(0, 10);
  const examId = replacingExam?.id || uid();

  if (replacingExam) {
    removeExamGlobally(replacingExam.id);
  }

  const nameMap = new Map();
  state.students.forEach((student) => {
    const keys = [normalizeName(student.name), ...(student.aliases || []).map((alias) => normalizeName(alias))]
      .filter(Boolean);
    keys.forEach((key) => {
      if (!nameMap.has(key)) {
        nameMap.set(key, []);
      }
      nameMap.get(key).push(student);
    });
  });

  let matched = 0;
  const unmatched = [];

  examDraft.entries.forEach((entry) => {
    const key = normalizeName(entry.name);
    const candidates = nameMap.get(key) || [];
    const student = candidates.shift();
    if (!student) {
      unmatched.push(entry.name);
      return;
    }
    student.exams = Array.isArray(student.exams) ? student.exams : [];
    student.exams.push({
      id: examId,
      name: examName,
      date: examDate,
      subjects: examDraft.subjects,
      scores: entry.scores,
      total: entry.total || { score: null, rankClass: null, rankSchool: null }
    });
    matched += 1;
  });

  state.exams.push({
    id: examId,
    name: examName,
    date: examDate,
    subjects: examDraft.subjects
  });

  const autoSettings = getAutoAcademicSettings();
  if (autoSettings.enabled) {
    recomputeAcademicAutoTags(false);
  } else {
    saveState();
    renderSearchResults();
    renderSeatGrid();
  }

  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamList(student);
      renderTagEditor(student);
    }
  }

  scoreStatus.textContent =
    unmatched.length > 0
      ? `已匹配 ${matched} 人，未匹配 ${unmatched.length} 人（可能由重名、别名未设置或姓名格式差异导致）。`
      : replacingExam
        ? `已匹配 ${matched} 人，考试成绩已替换。`
        : `已匹配 ${matched} 人，成绩已保存。`;
  saveScoreBtn.disabled = true;
  examDraft = null;
  scoreImportContext = { mode: "new", examId: null };
  renderExamManager();
}

function parseScoreFile(file) {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isCsv) {
    file
      .text()
      .then((text) => {
        const rows = parseCSV(text);
        const mapping = detectScoreMapping(rows);
        if (!mapping.reliable) {
          mappingState = { rows, headers: mapping.headers, suggestion: mapping, filename: file.name };
          openMappingModal(mapping.headers, mapping);
          scoreStatus.textContent = "未能可靠识别列，请手动选择映射。";
          return;
        }
        const data = parseScoreRowsWithMapping(rows, mapping);
        examDraft = data;
        scoreExamName.value = file.name.replace(/\.[^/.]+$/, "") || "考试";
        scoreExamDate.value = new Date().toISOString().slice(0, 10);
        saveScoreBtn.disabled = false;
        scoreStatus.textContent = `已解析 ${data.entries.length} 名学生成绩，请确认考试名称与日期。`;
      })
      .catch(() => {
        scoreStatus.textContent = "读取成绩文件失败，请重试。";
      });
    return;
  }

  if (isExcel) {
    if (!window.XLSX) {
      scoreStatus.textContent = "未加载 Excel 解析库，请联网或改用 CSV。";
      return;
    }
    file
      .arrayBuffer()
      .then((buffer) => {
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const mapping = detectScoreMapping(rows);
        if (!mapping.reliable) {
          mappingState = { rows, headers: mapping.headers, suggestion: mapping, filename: file.name };
          openMappingModal(mapping.headers, mapping);
          scoreStatus.textContent = "未能可靠识别列，请手动选择映射。";
          return;
        }
        const data = parseScoreRowsWithMapping(rows, mapping);
        examDraft = data;
        scoreExamName.value = file.name.replace(/\.[^/.]+$/, "") || "考试";
        scoreExamDate.value = new Date().toISOString().slice(0, 10);
        saveScoreBtn.disabled = false;
        scoreStatus.textContent = `已解析 ${data.entries.length} 名学生成绩，请确认考试名称与日期。`;
      })
      .catch(() => {
        scoreStatus.textContent = "读取成绩文件失败，请重试。";
      });
    return;
  }

  scoreStatus.textContent = "暂不支持该文件格式，请使用 .xlsx 或 .csv。";
}

function openRecordModal(studentId) {
  activeStudentId = studentId;
  const student = state.students.find((item) => item.id === studentId);
  if (!student) {
    return;
  }

  applyTargets = new Set();
  applySearchInput.value = "";
  activeWeekKey = getWeekKey(new Date());
  allowAcademicOverride = false;
  renderWeekSelect(student);
  recordStudentName.textContent = `${student.name} · ${getWeekLabel(activeWeekKey)}`;
  recordNoteInput.value = "";
  recordModal.classList.remove("hidden");
  recordModal.setAttribute("aria-hidden", "false");
  renderRecordList();
  renderExamList(student);
  renderTagEditor(student);
  renderApplyList();
}

function closeRecordModal() {
  recordModal.classList.add("hidden");
  recordModal.setAttribute("aria-hidden", "true");
  activeStudentId = null;
  applyTargets = new Set();
  allowAcademicOverride = false;
}

function addRecord(type) {
  const baseStudent = state.students.find((item) => item.id === activeStudentId);
  if (!baseStudent) {
    return;
  }

  const note = recordNoteInput.value.trim();
  const weekKey = getWeekKey(new Date());
  const targetIds = new Set([activeStudentId, ...applyTargets]);

  targetIds.forEach((studentId) => {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) {
      return;
    }
    const record = {
      id: uid(),
      type,
      note,
      date: new Date().toISOString().slice(0, 10),
      weekKey
    };
    student.records = Array.isArray(student.records) ? student.records : [];
    student.records.unshift(record);
  });
  recordNoteInput.value = "";
  activeWeekKey = weekKey;
  applyTargets = new Set();
  saveState();
  renderWeekSelect(baseStudent);
  renderRecordList();
  renderSearchResults();
  renderSeatGrid();
  renderApplyList();
}

function updateRecord(recordId, field, value) {
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student || !Array.isArray(student.records)) {
    return;
  }

  const record = student.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  record[field] = value;
  if (field === "date") {
    record.weekKey = getWeekKey(value);
  }
  saveState();
  renderSearchResults();
  renderSeatGrid();
}

function removeRecord(recordId) {
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student || !Array.isArray(student.records)) {
    return;
  }

  student.records = student.records.filter((item) => item.id !== recordId);
  saveState();
  renderRecordList();
  renderSearchResults();
  renderSeatGrid();
}

function afterGlobalExamChange() {
  const autoSettings = getAutoAcademicSettings();
  if (autoSettings.enabled) {
    recomputeAcademicAutoTags(false);
  } else {
    saveState();
    renderSearchResults();
    renderSeatGrid();
  }

  if (activeStudentId) {
    const activeStudent = state.students.find((item) => item.id === activeStudentId);
    if (activeStudent) {
      renderExamList(activeStudent);
      renderTagEditor(activeStudent);
    }
  }
  renderExamManager();
}

function renderRecordList() {
  recordList.innerHTML = "";
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student) {
    return;
  }

  const records = Array.isArray(student.records) ? student.records : [];
  const weekKey = activeWeekKey || getWeekKey(new Date());
  const weeklyRecords = records.filter(
    (record) => (record.weekKey || getWeekKey(record.date)) === weekKey
  );

  const weekTip = document.createElement("div");
  weekTip.className = "draw-status";
  weekTip.textContent = `当前统计周期：${getWeekLabel(weekKey)}`;
  recordList.appendChild(weekTip);

  if (weeklyRecords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "本周暂无记录，可以先添加奖或罚。";
    recordList.appendChild(empty);
    return;
  }

  weeklyRecords.forEach((record) => {
    const row = document.createElement("div");
    const rowClass =
      record.type === "奖" ? "reward" : record.type === "罚" ? "punish" : "note";
    row.className = `record-row ${rowClass}`;

    const typeSelect = document.createElement("select");
    ["奖", "罚", "备注"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      if (record.type === type) {
        option.selected = true;
      }
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener("change", (event) => {
      updateRecord(record.id, "type", event.target.value);
    });

    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.value = record.note || "";
    noteInput.maxLength = 40;
    noteInput.addEventListener("change", (event) => {
      updateRecord(record.id, "note", event.target.value.trim());
    });

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = record.date || new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", (event) => {
      updateRecord(record.id, "date", event.target.value);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "删除";
    deleteBtn.className = "ghost";
    deleteBtn.addEventListener("click", () => {
      removeRecord(record.id);
    });

    row.append(typeSelect, noteInput, dateInput, deleteBtn);
    recordList.appendChild(row);
  });
}

function renderWeekSelect(student) {
  const weekSet = new Set();
  (student.records || []).forEach((record) => {
    const key = record.weekKey || getWeekKey(record.date);
    if (key) {
      weekSet.add(key);
    }
  });

  const currentWeek = getWeekKey(new Date());
  weekSet.add(currentWeek);

  const weeks = Array.from(weekSet).sort().reverse();
  weekSelect.innerHTML = "";
  weeks.forEach((weekKey) => {
    const option = document.createElement("option");
    option.value = weekKey;
    option.textContent = weekKey === currentWeek ? `${weekKey}（本周）` : weekKey;
    weekSelect.appendChild(option);
  });

  if (!weeks.includes(activeWeekKey)) {
    activeWeekKey = currentWeek;
  }
  weekSelect.value = activeWeekKey;
}

function renderApplyList() {
  if (!applyList) {
    return;
  }
  applyList.innerHTML = "";
  const query = applySearchInput.value.trim();
  const normalized = normalizeName(query);
  const candidates = state.students.filter((student) => student.id !== activeStudentId);
  const filtered = query
    ? candidates.filter(
        (student) =>
          student.name.includes(query) ||
          normalizeName(student.name).includes(normalized) ||
          (student.aliases || []).some((alias) => normalizeName(alias).includes(normalized))
      )
    : candidates;

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = query ? "未找到匹配学生。" : "暂无可选学生。";
    applyList.appendChild(empty);
    return;
  }

  filtered.forEach((student) => {
    const label = document.createElement("label");
    label.className = "apply-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = applyTargets.has(student.id);
    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        applyTargets.add(student.id);
      } else {
        applyTargets.delete(student.id);
      }
    });
    const text = document.createElement("span");
    text.textContent = student.name;
    label.append(checkbox, text);
    applyList.appendChild(label);
  });
}

function sortTagsForSeatDisplay(tagIds) {
  const priority = (tagId) => {
    if (/_strong$/.test(tagId) || /_weak$/.test(tagId)) {
      return 0;
    }
    const tag = TAG_BY_ID.get(tagId);
    if (tag?.kind === "behavior") {
      return 1;
    }
    if (/_mid$/.test(tagId)) {
      return 2;
    }
    return 3;
  };
  return [...tagIds].sort((a, b) => priority(a) - priority(b));
}

function renderTagEditor(student) {
  if (!behaviorTagGroups || !academicAutoTags || !academicTagGroups || !allowAcademicManualOverride) {
    return;
  }
  ensureStudentTagFields(student);
  const manual = sanitizeTags(student.manualTags);
  const auto = sanitizeTags(student.autoTags);

  behaviorTagGroups.innerHTML = "";
  BEHAVIOR_TAG_GROUPS.forEach((group) => {
    const row = document.createElement("div");
    row.className = "tag-group-row";
    const title = document.createElement("div");
    title.className = "tag-group-title";
    title.textContent = group.name;
    const chips = document.createElement("div");
    chips.className = "tag-chip-list";
    const selectedId = getTagByGroup(manual, group.id);
    group.tags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `tag-chip behavior ${selectedId === tag.id ? "active" : ""}`;
      chip.textContent = tag.labelZh;
      chip.addEventListener("click", () => {
        const currentStudent = state.students.find((item) => item.id === student.id);
        if (!currentStudent) {
          return;
        }
        const nextTagId = selectedId === tag.id ? "" : tag.id;
        setStudentManualGroupTag(currentStudent, group.id, nextTagId);
        saveState();
        renderTagEditor(currentStudent);
        renderSeatGrid();
      });
      chips.appendChild(chip);
    });
    row.append(title, chips);
    behaviorTagGroups.appendChild(row);
  });

  academicAutoTags.innerHTML = "";
  const effectiveAuto = sortTagsForSeatDisplay(auto)
    .map((id) => TAG_BY_ID.get(id))
    .filter(Boolean);
  if (!effectiveAuto.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无自动学科标签。";
    academicAutoTags.appendChild(empty);
  } else {
    effectiveAuto.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = `tag-chip ${tag.id.endsWith("_strong") ? "strong" : tag.id.endsWith("_weak") ? "weak" : "mid"}`;
      chip.textContent = tag.labelZh;
      academicAutoTags.appendChild(chip);
    });
  }

  allowAcademicManualOverride.checked = allowAcademicOverride;
  academicTagGroups.classList.toggle("hidden", !allowAcademicOverride);
  academicTagGroups.innerHTML = "";
  if (!allowAcademicOverride) {
    return;
  }

  ACADEMIC_TAG_GROUPS.forEach((group) => {
    const row = document.createElement("div");
    row.className = "tag-group-row";
    const title = document.createElement("div");
    title.className = "tag-group-title";
    title.textContent = group.name;
    const chips = document.createElement("div");
    chips.className = "tag-chip-list";
    const selectedId = getTagByGroup(manual, group.id);
    group.tags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `tag-chip academic ${selectedId === tag.id ? "active" : ""}`;
      chip.textContent = tag.labelZh;
      chip.addEventListener("click", () => {
        const currentStudent = state.students.find((item) => item.id === student.id);
        if (!currentStudent) {
          return;
        }
        const nextTagId = selectedId === tag.id ? "" : tag.id;
        setStudentManualGroupTag(currentStudent, group.id, nextTagId);
        saveState();
        renderTagEditor(currentStudent);
        renderSeatGrid();
      });
      chips.appendChild(chip);
    });
    row.append(title, chips);
    academicTagGroups.appendChild(row);
  });
}

function renderExamList(student) {
  examList.innerHTML = "";
  if (examTrendModeSelect) {
    examTrendModeSelect.value = examTrendMode;
  }
  const exams = Array.isArray(student.exams) ? student.exams : [];
  if (!exams.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无成绩记录。";
    examList.appendChild(empty);
    examTrends.innerHTML = "";
    exportTrendsBtn.disabled = false;
    return;
  }

  const sorted = [...exams].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  sorted.forEach((exam) => {
    const card = document.createElement("div");
    card.className = "exam-card";

    const header = document.createElement("div");
    header.className = "exam-card-header";

    const name = document.createElement("div");
    name.textContent = exam.name || "考试";

    const date = document.createElement("div");
    date.textContent = exam.date || "";
    header.append(name, date);

    const scores = document.createElement("div");
    scores.className = "exam-scores";
    const subjects = exam.subjects || [];
    subjects.forEach((subject) => {
      const item = document.createElement("div");
      item.className = "exam-score-item";
      const label = document.createElement("span");
      label.textContent = subject;
      const value = document.createElement("span");
      const subjectData = exam.scores?.[subject];
      const bits = [];
      const score = parseScoreValue(subjectData);
      if (Number.isFinite(score)) {
        bits.push(`${score}`);
      }
      if (subjectData && typeof subjectData === "object") {
        if (Number.isInteger(subjectData.rankClass)) {
          bits.push(`班${subjectData.rankClass}`);
        }
        if (Number.isInteger(subjectData.rankSchool)) {
          bits.push(`校${subjectData.rankSchool}`);
        }
      }
      value.textContent = bits.length ? bits.join(" / ") : "-";
      item.append(label, value);
      scores.appendChild(item);
    });

    if (
      exam.total &&
      (Number.isFinite(exam.total.score) ||
        Number.isInteger(exam.total.rankClass) ||
        Number.isInteger(exam.total.rankSchool))
    ) {
      const totalMeta = document.createElement("div");
      totalMeta.className = "draw-status";
      const parts = [];
      if (Number.isFinite(exam.total.score)) {
        parts.push(`总分 ${exam.total.score}`);
      }
      if (Number.isInteger(exam.total.rankClass)) {
        parts.push(`总班排 ${exam.total.rankClass}`);
      }
      if (Number.isInteger(exam.total.rankSchool)) {
        parts.push(`总校排 ${exam.total.rankSchool}`);
      }
      totalMeta.textContent = parts.join(" · ");
      card.append(header, scores, totalMeta);
    } else {
      card.append(header, scores);
    }
    examList.appendChild(card);
  });

  renderExamTrends(sorted);
  exportTrendsBtn.disabled = false;
}

function renderExamTrends(exams) {
  examTrends.innerHTML = "";
  if (!exams.length) {
    return false;
  }

  const chronological = [...exams].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const labels = chronological.map((exam) => exam.date || exam.name || "考试");
  const rankMode = examTrendMode === "rankSchool";
  const totals = chronological.map((exam) => (rankMode ? parseRankValue(exam.total?.rankSchool) : sumExamScores(exam.scores)));
  const totalValues = totals.filter((value) => Number.isFinite(value));

  if (totalValues.length >= 2) {
    const card = createChartCard(rankMode ? "年级排名趋势" : "总分趋势", labels, totals, {
      width: 360,
      height: 140,
      color: "#1c6f5f",
      reverseY: rankMode
    });
    examTrends.appendChild(card);
  }

  const subjectSet = new Set();
  chronological.forEach((exam) => {
    (exam.subjects || []).forEach((subject) => {
      if (subject) {
        subjectSet.add(subject);
      }
    });
  });

  const subjects = [
    ...SUBJECT_ORDER.filter((subject) => subjectSet.has(subject)),
    ...[...subjectSet].filter((subject) => !SUBJECT_ORDER.includes(subject))
  ];
  const subjectCards = document.createElement("div");
  subjectCards.className = "chart-grid";
  let hasSubjectChart = false;

  subjects.forEach((subject) => {
    const values = chronological.map((exam) =>
      rankMode ? parseRankValue(exam.scores?.[subject]?.rankSchool) : parseScoreValue(exam.scores?.[subject])
    );
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length < 2) {
      return;
    }
    hasSubjectChart = true;
    const card = createChartCard(`${subject}${rankMode ? "年级排名趋势" : "趋势"}`, labels, values, {
      width: 240,
      height: 120,
      color: "#f0b429",
      reverseY: rankMode
    });
    subjectCards.appendChild(card);
  });

  if (hasSubjectChart) {
    examTrends.appendChild(subjectCards);
  } else if (!totalValues.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = rankMode ? "暂无可用的年级排名趋势数据。" : "暂无可用的成绩趋势数据。";
    examTrends.appendChild(empty);
  }

  return totalValues.length >= 2 || hasSubjectChart;
}

function sumExamScores(scores = {}) {
  let total = 0;
  let hasValue = false;
  Object.values(scores).forEach((value) => {
    const parsed = parseScoreValue(value);
    if (Number.isFinite(parsed)) {
      total += parsed;
      hasValue = true;
    }
  });
  return hasValue ? total : null;
}

function parseScoreValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "object") {
    return parseScoreValue(value.score);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRankValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "object") {
    return parseRankValue(value.rankSchool);
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createChartCard(title, labels, values, options) {
  const card = document.createElement("div");
  card.className = "chart-card";

  const header = document.createElement("div");
  header.className = "chart-title";
  header.textContent = title;

  const subtitle = document.createElement("div");
  subtitle.className = "chart-subtitle";
  subtitle.textContent = labels.join(" · ");

  const svg = createLineChart(values, options);
  svg.classList.add("chart-svg");

  card.append(header, subtitle, svg);
  return card;
}

function createLineChart(values, options) {
  const width = options.width || 320;
  const height = options.height || 120;
  const padding = 16;
  const color = options.color || "#1c6f5f";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const parsed = values.map((value) => (Number.isFinite(value) ? value : null));
  const numericValues = parsed.filter((value) => value !== null);
  if (!numericValues.length) {
    return svg;
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;

  const points = parsed.map((value, index) => {
    const x = padding + (index / Math.max(parsed.length - 1, 1)) * (width - padding * 2);
    if (value === null) {
      return { x, y: null };
    }
    const normalized = options.reverseY ? (max - value) / range : (value - min) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y };
  });

  const pathPoints = points.filter((point) => point.y !== null);
  if (!pathPoints.length) {
    return svg;
  }

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute(
    "points",
    pathPoints.map((point) => `${point.x},${point.y}`).join(" ")
  );
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", color);
  polyline.setAttribute("stroke-width", "2");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");

  const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
  baseline.setAttribute("x1", padding);
  baseline.setAttribute("x2", width - padding);
  baseline.setAttribute("y1", height - padding);
  baseline.setAttribute("y2", height - padding);
  baseline.setAttribute("stroke", "#efe4d6");
  baseline.setAttribute("stroke-width", "1");

  svg.appendChild(baseline);
  svg.appendChild(polyline);

  pathPoints.forEach((point) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", color);
    svg.appendChild(circle);
  });

  return svg;
}

function exportTrendsPdf() {
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student) {
    return;
  }
  if (!examTrends.querySelector(".chart-card")) {
    alert("暂无可导出的趋势图。");
    return;
  }

  const title = `${student.name} 成绩趋势`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("无法打开新窗口，请检查浏览器设置。");
    return;
  }

  const style = `
    body { font-family: "Noto Sans SC", "PingFang SC", sans-serif; margin: 24px; color: #1d1d1f; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
    .chart-card { border: 1px solid #eadfce; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
    .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .chart-subtitle { font-size: 11px; color: #666; margin-bottom: 6px; }
    .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    svg { width: 100%; height: auto; }
  `;

  const content = `
    <h1>${title}</h1>
    <div class="meta">导出时间：${new Date().toLocaleString()}</div>
    ${examTrends.innerHTML}
  `;

  win.document.open();
  win.document.write(`<!doctype html><html><head><title>${title}</title><style>${style}</style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 300);
}

function renderConstraintLists() {
  if (!noDeskPairList || !frontStudentList || !lockPairList) {
    return;
  }
  const idToName = new Map(state.students.map((student) => [student.id, student.name]));
  lockPairList.innerHTML = "";
  if (!state.settings.constraints.lockedDeskmatePairs.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无同桌锁定。";
    lockPairList.appendChild(empty);
  } else {
    state.settings.constraints.lockedDeskmatePairs.forEach((pair, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      label.textContent = `${idToName.get(pair.a) || "未知"} ↔ ${idToName.get(pair.b) || "未知"}`;
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        state.settings.constraints.lockedDeskmatePairs.splice(index, 1);
        saveState();
        renderConstraintLists();
      });
      item.append(label, del);
      lockPairList.appendChild(item);
    });
  }

  noDeskPairList.innerHTML = "";
  if (!state.settings.constraints.noDeskmatePairs.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无不做同桌限制。";
    noDeskPairList.appendChild(empty);
  } else {
    state.settings.constraints.noDeskmatePairs.forEach((pair, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      label.textContent = `${idToName.get(pair.a) || "未知"} - ${idToName.get(pair.b) || "未知"}`;
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        state.settings.constraints.noDeskmatePairs.splice(index, 1);
        saveState();
        renderConstraintLists();
      });
      item.append(label, del);
      noDeskPairList.appendChild(item);
    });
  }

  frontStudentList.innerHTML = "";
  if (!state.settings.constraints.frontRowStudentIds.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无前排限制。";
    frontStudentList.appendChild(empty);
  } else {
    state.settings.constraints.frontRowStudentIds.forEach((id, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      label.textContent = idToName.get(id) || "未知";
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "删除";
      del.addEventListener("click", () => {
        state.settings.constraints.frontRowStudentIds.splice(index, 1);
        saveState();
        renderConstraintLists();
      });
      item.append(label, del);
      frontStudentList.appendChild(item);
    });
  }
}

function renderAll() {
  normalizeState();
  renderSearchResults();
  seatTotal.textContent = getSeatCapacity().toString();
  renderRowLabels();
  renderSeatGrid();
  renderHistoryList();
  noRepeat.checked = Boolean(state.draw.noRepeat);
  pairByGender.checked = Boolean(state.settings.pairByGender);
  if (keepLockedEmpty) {
    keepLockedEmpty.checked = Boolean(state.settings.keepLockedEmpty);
  }
  if (frontRowsInput) {
    frontRowsInput.value = String(state.settings.constraints.frontRows || 2);
  }
  renderAutoAcademicSettings();
  renderExamManager();
  renderDrawResults();
  renderConstraintLists();
  renderBackupInfo();
  if (!importStatus.textContent) {
    importStatus.textContent = "Excel 表建议包含「姓名」列，可选「行」「列」「性别」定位。";
  }
  if (!scoreStatus.textContent) {
    scoreStatus.textContent = "成绩表格式：行=学生，列=科目（语数英物化地历政生）。";
  }
  applySidebarState();
}

function initSeatCardMode() {
  if (!cardCompactBtn || !cardDetailBtn) {
    return;
  }
  const applyMode = (mode) => {
    const compact = mode === "compact";
    document.body.classList.toggle("compact-cards", compact);
    cardCompactBtn.classList.toggle("active", compact);
    cardDetailBtn.classList.toggle("active", !compact);
    localStorage.setItem(SEAT_CARD_MODE_KEY, compact ? "compact" : "detail");
  };

  const saved = localStorage.getItem(SEAT_CARD_MODE_KEY);
  applyMode(saved === "detail" ? "detail" : "compact");

  cardCompactBtn.addEventListener("click", () => applyMode("compact"));
  cardDetailBtn.addEventListener("click", () => applyMode("detail"));
}

function initSidebarNavigation() {
  const sidebar = document.querySelector(".panel.controls");
  if (!sidebar) {
    return;
  }
  const sections = Array.from(sidebar.querySelectorAll(".sidebar-section[data-section-key]"));
  if (!sections.length) {
    return;
  }

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SIDEBAR_SECTION_STATE_KEY) || "{}") || {};
  } catch (error) {
    saved = {};
  }

  sections.forEach((section) => {
    const key = section.dataset.sectionKey;
    const defaultOpen = key === "common";
    if (Object.prototype.hasOwnProperty.call(saved, key)) {
      section.open = Boolean(saved[key]);
    } else {
      section.open = defaultOpen;
    }
    section.addEventListener("toggle", () => {
      const snapshot = {};
      sections.forEach((item) => {
        snapshot[item.dataset.sectionKey] = item.open;
      });
      localStorage.setItem(SIDEBAR_SECTION_STATE_KEY, JSON.stringify(snapshot));
    });
  });

  const pills = Array.from(sidebar.querySelectorAll(".quick-pill[data-target]"));
  const setActivePillById = (id) => {
    pills.forEach((item) => {
      item.classList.toggle("active", item.dataset.target === id);
    });
  };

  const setActiveTab = (id) => {
    let resolvedId = id;
    if (!sections.some((section) => section.id === resolvedId)) {
      resolvedId = "sec-common";
    }
    setActivePillById(resolvedId);
    sections.forEach((section) => {
      const isActive = section.id === resolvedId;
      section.hidden = !isActive;
      section.classList.toggle("is-active-tab", isActive);
    });
    localStorage.setItem(SIDEBAR_ACTIVE_TAB_KEY, resolvedId);
  };

  setActiveTab(localStorage.getItem(SIDEBAR_ACTIVE_TAB_KEY) || "sec-common");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetId = pill.dataset.target;
      const section = sidebar.querySelector(`#${targetId}`);
      if (!section) {
        return;
      }
      if (!section.open) {
        section.open = true;
      }
      setActiveTab(targetId);
      section.classList.remove("flash-highlight");
      void section.offsetWidth;
      section.classList.add("flash-highlight");
      setTimeout(() => section.classList.remove("flash-highlight"), 850);
    });
  });
}

function applySidebarState() {
  const app = document.querySelector(".app");
  if (state.settings.sidebarCollapsed) {
    app.classList.add("sidebar-collapsed");
    toggleSidebarBtn.textContent = "展开侧栏";
  } else {
    app.classList.remove("sidebar-collapsed");
    toggleSidebarBtn.textContent = "收起侧栏";
  }
}

addStudentBtn.addEventListener("click", () => {
  addStudent(studentNameInput.value, studentGenderSelect.value, studentAliasInput.value);
  maybeShowEasterEgg(studentNameInput.value);
  studentNameInput.value = "";
  studentAliasInput.value = "";
  studentGenderSelect.value = "";
  studentNameInput.focus();
});

studentNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addStudent(studentNameInput.value, studentGenderSelect.value, studentAliasInput.value);
    maybeShowEasterEgg(studentNameInput.value);
    studentNameInput.value = "";
    studentAliasInput.value = "";
    studentGenderSelect.value = "";
  }
});

studentSearchInput.addEventListener("input", () => {
  renderSearchResults();
  maybeShowEasterEgg(studentSearchInput.value);
});

toggleSidebarBtn.addEventListener("click", () => {
  state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
  saveState();
  applySidebarState();
});

shuffleSeatsBtn.addEventListener("click", () => {
  if (state.students.length === 0) {
    return;
  }
  shuffleSeats();
});

resetSeatsBtn.addEventListener("click", () => {
  resetSeats();
});

importBtn.addEventListener("click", () => {
  if (!importFileInput.files.length) {
    importStatus.textContent = "请先选择 Excel 或 CSV 文件。";
    return;
  }
  importStatus.textContent = "正在导入...";
  importFile(importFileInput.files[0]);
  importFileInput.value = "";
});

exportSeatsBtn.addEventListener("click", () => {
  exportSeatsCsv();
});

exportBackupBtn.addEventListener("click", () => {
  exportBackupJson();
});

importBackupBtn.addEventListener("click", () => {
  if (!importBackupInput.files.length) {
    showToast("请选择备份文件", "error");
    return;
  }
  importBackupJson(importBackupInput.files[0]);
  importBackupInput.value = "";
});

if (backupReminderExportBtn) {
  backupReminderExportBtn.addEventListener("click", () => {
    exportBackupJson();
  });
}

parseScoreBtn.addEventListener("click", () => {
  if (!scoreFileInput.files.length) {
    scoreStatus.textContent = "请先选择成绩表文件。";
    return;
  }
  scoreStatus.textContent = "正在解析成绩...";
  parseScoreFile(scoreFileInput.files[0]);
  scoreFileInput.value = "";
});

saveScoreBtn.addEventListener("click", () => {
  if (!examDraft) {
    scoreStatus.textContent = "请先解析成绩表。";
    return;
  }
  scoreImportContext = { mode: "new", examId: null };
  applyExamDraft();
});

if (existingExamSelect) {
  existingExamSelect.addEventListener("change", () => {
    const exam = (state.exams || []).find((item) => item.id === existingExamSelect.value);
    if (!exam) {
      return;
    }
    scoreExamName.value = exam.name || "";
    scoreExamDate.value = exam.date || "";
  });
}

if (deleteExamBtn) {
  deleteExamBtn.addEventListener("click", () => {
    const examId = existingExamSelect?.value || "";
    if (!examId) {
      scoreStatus.textContent = "请先选择要删除的考试。";
      return;
    }
    const exam = (state.exams || []).find((item) => item.id === examId);
    const label = `${exam?.name || "考试"} ${exam?.date || ""}`.trim();
    if (!confirm(`确定整体删除「${label}」这次考试吗？这会删除所有学生的该次成绩。`)) {
      return;
    }
    if (!removeExamGlobally(examId)) {
      scoreStatus.textContent = "未找到该次考试。";
      renderExamManager();
      return;
    }
    afterGlobalExamChange();
    scoreStatus.textContent = "该次考试已整体删除。";
    showToast("该次考试已整体删除", "success");
  });
}

if (replaceExamBtn) {
  replaceExamBtn.addEventListener("click", () => {
    const examId = existingExamSelect?.value || "";
    if (!examId) {
      scoreStatus.textContent = "请先选择要替换的考试。";
      return;
    }
    if (!examDraft) {
      scoreStatus.textContent = "请先解析新的成绩表，再执行替换。";
      return;
    }
    const exam = (state.exams || []).find((item) => item.id === examId);
    const label = `${exam?.name || "考试"} ${exam?.date || ""}`.trim();
    if (!confirm(`确定用当前已解析的成绩表替换「${label}」吗？这会覆盖全班该次考试记录。`)) {
      return;
    }
    scoreImportContext = { mode: "replace", examId };
    applyExamDraft();
  });
}

saveHistoryBtn.addEventListener("click", () => {
  saveCurrentSeatHistory();
});

if (historyFilterInput) {
  historyFilterInput.addEventListener("input", () => {
    renderHistoryList();
  });
}

drawBtn.addEventListener("click", () => {
  drawNames();
});

resetDrawBtn.addEventListener("click", () => {
  resetDrawPool();
  renderDrawResults();
});

if (clearDrawHistoryBtn) {
  clearDrawHistoryBtn.addEventListener("click", () => {
    clearDrawHistory();
    renderDrawResults();
    showToast("抽签记录已清除", "success");
  });
}

noRepeat.addEventListener("change", (event) => {
  state.draw.noRepeat = event.target.checked;
  if (state.draw.noRepeat) {
    resetDrawPool();
  }
  saveState();
  renderDrawResults();
});

pairByGender.addEventListener("change", (event) => {
  state.settings.pairByGender = event.target.checked;
  saveState();
});

if (shuffleByComplementBtn) {
  shuffleByComplementBtn.addEventListener("click", () => {
    if (!state.students.length) {
      showToast("暂无学生可排座", "error");
      return;
    }
    openComplementModal();
  });
}

function saveAutoAcademicSettingsFromInputs() {
  if (!autoAcademicEnabled) {
    return;
  }
  state.settings.autoAcademic = {
    enabled: autoAcademicEnabled.checked,
    rangeMode: autoAcademicRangeMode.value === "recent" ? "recent" : "all",
    recentN: Math.min(20, Math.max(1, Number.parseInt(autoAcademicRecentN.value, 10) || 3)),
    topN: Math.min(50, Math.max(1, Number.parseInt(autoAcademicTopN.value, 10) || 10)),
    bottomN: Math.min(50, Math.max(1, Number.parseInt(autoAcademicBottomN.value, 10) || 10)),
    includeMid: autoAcademicIncludeMid.checked
  };
  saveState();
  renderAutoAcademicSettings();
}

if (autoAcademicEnabled) {
  [autoAcademicEnabled, autoAcademicRangeMode, autoAcademicRecentN, autoAcademicTopN, autoAcademicBottomN, autoAcademicIncludeMid].forEach((el) => {
    el.addEventListener("change", saveAutoAcademicSettingsFromInputs);
  });
}

if (recomputeAcademicBtn) {
  recomputeAcademicBtn.addEventListener("click", () => {
    saveAutoAcademicSettingsFromInputs();
    recomputeAcademicAutoTags(true);
  });
}

if (allowAcademicManualOverride) {
  allowAcademicManualOverride.addEventListener("change", (event) => {
    allowAcademicOverride = event.target.checked;
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderTagEditor(student);
    }
  });
}

if (keepLockedEmpty) {
  keepLockedEmpty.addEventListener("change", (event) => {
    state.settings.keepLockedEmpty = event.target.checked;
    saveState();
  });
}

if (addNoDeskPairBtn) {
  addNoDeskPairBtn.addEventListener("click", () => {
    const studentA = resolveStudentByKeyword(pairAInput.value);
    const studentB = resolveStudentByKeyword(pairBInput.value);
    if (!studentA || !studentB || studentA.id === studentB.id) {
      showToast("请正确填写两个不同学生", "error");
      return;
    }
    const exists = state.settings.constraints.noDeskmatePairs.some(
      (pair) =>
        (pair.a === studentA.id && pair.b === studentB.id) ||
        (pair.a === studentB.id && pair.b === studentA.id)
    );
    if (!exists) {
      state.settings.constraints.noDeskmatePairs.push({ a: studentA.id, b: studentB.id });
      saveState();
      renderConstraintLists();
    }
    pairAInput.value = "";
    pairBInput.value = "";
  });
}

if (addLockPairBtn) {
  addLockPairBtn.addEventListener("click", () => {
    const studentA = resolveStudentByKeyword(lockPairAInput.value);
    const studentB = resolveStudentByKeyword(lockPairBInput.value);
    if (!studentA || !studentB || studentA.id === studentB.id) {
      showToast("请正确填写两个不同学生", "error");
      return;
    }
    const exists = state.settings.constraints.lockedDeskmatePairs.some(
      (pair) =>
        (pair.a === studentA.id && pair.b === studentB.id) ||
        (pair.a === studentB.id && pair.b === studentA.id)
    );
    if (!exists) {
      state.settings.constraints.lockedDeskmatePairs.push({ a: studentA.id, b: studentB.id });
      saveState();
      renderConstraintLists();
    }
    lockPairAInput.value = "";
    lockPairBInput.value = "";
  });
}

if (addFrontStudentBtn) {
  addFrontStudentBtn.addEventListener("click", () => {
    const student = resolveStudentByKeyword(frontStudentInput.value);
    if (!student) {
      showToast("未找到该学生", "error");
      return;
    }
    if (!state.settings.constraints.frontRowStudentIds.includes(student.id)) {
      state.settings.constraints.frontRowStudentIds.push(student.id);
      saveState();
      renderConstraintLists();
    }
    frontStudentInput.value = "";
  });
}

if (frontRowsInput) {
  frontRowsInput.addEventListener("change", (event) => {
    state.settings.constraints.frontRows = Math.max(1, Number.parseInt(event.target.value, 10) || 2);
    saveState();
  });
}

setupNameSuggest(pairAInput, pairASuggest);
setupNameSuggest(pairBInput, pairBSuggest);
setupNameSuggest(lockPairAInput, lockPairASuggest);
setupNameSuggest(lockPairBInput, lockPairBSuggest);
setupNameSuggest(frontStudentInput, frontStudentSuggest);

[pairAInput, pairBInput, frontStudentInput, lockPairAInput, lockPairBInput].forEach((input) => {
  if (!input) {
    return;
  }
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (tryPickFirstSuggestion(input)) {
      return;
    }
    if (input === pairAInput || input === pairBInput) {
      addNoDeskPairBtn?.click();
    } else if (input === frontStudentInput) {
      addFrontStudentBtn?.click();
    } else {
      addLockPairBtn?.click();
    }
  });
});

recordClose.addEventListener("click", closeRecordModal);
recordModal.addEventListener("click", (event) => {
  if (event.target === recordModal) {
    closeRecordModal();
  }
});

deleteStudentBtn.addEventListener("click", () => {
  if (!activeStudentId) {
    return;
  }
  const student = state.students.find((item) => item.id === activeStudentId);
  if (student && confirm(`确定删除 ${student.name} 吗？`)) {
    removeStudent(student.id);
    closeRecordModal();
  }
});

applySearchInput.addEventListener("input", () => {
  renderApplyList();
});

applyAllBtn.addEventListener("click", () => {
  const query = applySearchInput.value.trim();
  const candidates = state.students.filter((student) => student.id !== activeStudentId);
  const filtered = query ? candidates.filter((student) => student.name.includes(query)) : candidates;
  filtered.forEach((student) => applyTargets.add(student.id));
  renderApplyList();
});

applyClearBtn.addEventListener("click", () => {
  applyTargets = new Set();
  renderApplyList();
});

weekSelect.addEventListener("change", (event) => {
  activeWeekKey = event.target.value;
  const student = state.students.find((item) => item.id === activeStudentId);
  if (student) {
    recordStudentName.textContent = `${student.name} · ${getWeekLabel(activeWeekKey)}`;
  }
  renderRecordList();
});

historyClose.addEventListener("click", closeHistoryModal);
historyModal.addEventListener("click", (event) => {
  if (event.target === historyModal) {
    closeHistoryModal();
  }
});

if (exportModalClose) {
  exportModalClose.addEventListener("click", closeExportModal);
}
if (exportModalCancel) {
  exportModalCancel.addEventListener("click", closeExportModal);
}
if (exportModalConfirm) {
  exportModalConfirm.addEventListener("click", exportStudentDataSelection);
}
if (exportModal) {
  exportModal.addEventListener("click", (event) => {
    if (event.target === exportModal) {
      closeExportModal();
    }
  });
}
if (examTrendModeSelect) {
  examTrendModeSelect.addEventListener("change", (event) => {
    examTrendMode = event.target.value === "rankSchool" ? "rankSchool" : "score";
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamTrends(Array.isArray(student.exams) ? [...student.exams].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : []);
    }
  });
}
if (complementClose) {
  complementClose.addEventListener("click", closeComplementModal);
}
if (complementPreviewBtn) {
  complementPreviewBtn.addEventListener("click", previewComplementPlacement);
}
if (complementApplyBtn) {
  complementApplyBtn.addEventListener("click", applyComplementPlacement);
}
if (complementModal) {
  complementModal.addEventListener("click", (event) => {
    if (event.target === complementModal) {
      closeComplementModal();
    }
  });
}

mappingClose.addEventListener("click", closeMappingModal);
mappingCancel.addEventListener("click", closeMappingModal);
mappingModal.addEventListener("click", (event) => {
  if (event.target === mappingModal) {
    closeMappingModal();
  }
});

easterClose.addEventListener("click", closeEasterModal);
easterModal.addEventListener("click", (event) => {
  if (event.target === easterModal) {
    closeEasterModal();
  }
});

mappingApply.addEventListener("click", () => {
  if (!mappingState) {
    closeMappingModal();
    return;
  }
  const nameSelect = mappingList.querySelector("select[data-role=\"name\"]");
  const nameValue = nameSelect ? nameSelect.value : "";
  if (!nameValue) {
    alert("请选择姓名列。");
    return;
  }
  const subjectMappings = [];
  SUBJECT_ORDER.forEach((subject) => {
    const scoreSelect = mappingList.querySelector(`select[data-subject="${subject}"][data-field="score"]`);
    const classSelect = mappingList.querySelector(`select[data-subject="${subject}"][data-field="rankClass"]`);
    const schoolSelect = mappingList.querySelector(`select[data-subject="${subject}"][data-field="rankSchool"]`);
    if (scoreSelect && scoreSelect.value !== "") {
      subjectMappings.push({
        subject,
        scoreCol: Number.parseInt(scoreSelect.value, 10),
        rankClassCol: classSelect && classSelect.value !== "" ? Number.parseInt(classSelect.value, 10) : -1,
        rankSchoolCol: schoolSelect && schoolSelect.value !== "" ? Number.parseInt(schoolSelect.value, 10) : -1
      });
    }
  });
  if (!subjectMappings.length) {
    alert("请至少选择一科成绩列。");
    return;
  }
  const usedCols = new Set();
  const totalMapping = {
    scoreCol: Number.parseInt(mappingList.querySelector('select[data-role="total-score"]')?.value || "-1", 10),
    rankClassCol: Number.parseInt(mappingList.querySelector('select[data-role="total-class"]')?.value || "-1", 10),
    rankSchoolCol: Number.parseInt(mappingList.querySelector('select[data-role="total-school"]')?.value || "-1", 10)
  };
  try {
    for (const item of subjectMappings) {
      [item.scoreCol, item.rankClassCol, item.rankSchoolCol].forEach((col) => {
        if (col < 0) {
          return;
        }
        if (usedCols.has(col)) {
          throw new Error("duplicate-column");
        }
        usedCols.add(col);
      });
    }
    [totalMapping.scoreCol, totalMapping.rankClassCol, totalMapping.rankSchoolCol].forEach((col) => {
      if (col < 0) {
        return;
      }
      if (usedCols.has(col)) {
        throw new Error("duplicate-column");
      }
      usedCols.add(col);
    });
  } catch (error) {
    if (error.message === "duplicate-column") {
      alert("同一列被重复映射，请调整后再导入。");
      return;
    }
  }
  const mapping = {
    nameCol: Number.parseInt(nameValue, 10),
    subjectMappings,
    totalMapping
  };
  const data = parseScoreRowsWithMapping(mappingState.rows, mapping);
  examDraft = data;
  scoreExamName.value =
    mappingState.filename?.replace(/\.[^/.]+$/, "")?.trim() || scoreExamName.value || "考试";
  scoreExamDate.value = new Date().toISOString().slice(0, 10);
  saveScoreBtn.disabled = false;
  scoreStatus.textContent = `已解析 ${data.entries.length} 名学生成绩，请确认考试名称与日期。`;
  closeMappingModal();
});

addRewardBtn.addEventListener("click", () => addRecord("奖"));
addPunishBtn.addEventListener("click", () => addRecord("罚"));
addNoteBtn.addEventListener("click", () => addRecord("备注"));

exportTrendsBtn.addEventListener("click", () => {
  openExportModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!recordModal.classList.contains("hidden")) {
      closeRecordModal();
    }
    if (!historyModal.classList.contains("hidden")) {
      closeHistoryModal();
    }
    if (exportModal && !exportModal.classList.contains("hidden")) {
      closeExportModal();
    }
    if (complementModal && !complementModal.classList.contains("hidden")) {
      closeComplementModal();
    }
    if (!mappingModal.classList.contains("hidden")) {
      closeMappingModal();
    }
    if (!easterModal.classList.contains("hidden")) {
      closeEasterModal();
    }
  }
});

normalizeState();
initSeatCardMode();
initSidebarNavigation();
renderAll();
