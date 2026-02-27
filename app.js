const COLS = 8;
const STORAGE_KEY = "homeroom-seat-manager-v1";
const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];
const BACKUP_VERSION = 1;
const SIDEBAR_SECTION_STATE_KEY = "sidebarSectionOpen-v1";
const SEAT_CARD_MODE_KEY = "seatCardMode";

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
const deleteStudentBtn = document.getElementById("deleteStudentBtn");
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
    exams: Array.isArray(student.exams) ? student.exams : []
  }));
  state.seatOrder = Array.isArray(state.seatOrder) ? state.seatOrder : [];
  state.lockedSeats = Array.isArray(state.lockedSeats)
    ? state.lockedSeats.map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value >= 0)
    : [];
  state.seatHistory = Array.isArray(state.seatHistory) ? state.seatHistory : [];
  state.exams = Array.isArray(state.exams) ? state.exams : [];
  state.lastBackupAt = state.lastBackupAt || "";
  state.settings = state.settings || { sidebarCollapsed: false, pairByGender: false, keepLockedEmpty: true, constraints: {} };
  state.settings.sidebarCollapsed = Boolean(state.settings.sidebarCollapsed);
  state.settings.pairByGender = Boolean(state.settings.pairByGender);
  state.settings.keepLockedEmpty =
    state.settings.keepLockedEmpty === undefined ? true : Boolean(state.settings.keepLockedEmpty);
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

function renderSeatGrid() {
  seatGroups.innerHTML = "";
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const lockedSet = new Set(state.lockedSeats);
  const rows = getRowCount();

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

        if (student && student.gender) {
          const gender = document.createElement("div");
          gender.className = "seat-meta gender";
          gender.textContent = `性别：${student.gender}`;
          seat.append(name, meta, gender, label, lockBtn);
        } else {
          seat.append(name, meta, label, lockBtn);
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
            lines.push(`  ${subject}：${exam.scores?.[subject] ?? "-"}`);
          });
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
      const student = { id: uid(), name, gender, aliases: [], records: [], exams: [] };
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
      const student = { id: uid(), name, gender, aliases: [], records: [], exams: [] };
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
      const student = { id: uid(), name, gender, aliases: [], records: [], exams: [] };
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

function detectScoreMapping(rows) {
  if (!rows.length) {
    return {
      reliable: false,
      reason: "empty",
      headers: [],
      nameCol: -1,
      subjectCols: [],
      conflicts: ["文件为空，无法识别列"],
      candidatesBySubject: {}
    };
  }

  const rawHeaders = rows[0].map((cell) => cell.toString().trim());
  const headers = rawHeaders.map((cell) => normalizeHeader(cell));
  const nameCol = rawHeaders.findIndex((cell, index) => {
    const normalized = headers[index];
    return /姓名|名字|学生/.test(normalized);
  });

  const excludePattern =
    /总分|总成绩|排名|名次|位次|学号|班级|考号|准考证|考场|座位|组别|年级|性别|备注|缺考|缺席/;

  const subjectPatterns = [
    { key: "语文", patterns: [/语文/, /^语$/] },
    { key: "数学", patterns: [/数学/, /^数$/] },
    { key: "英语", patterns: [/英语/, /^英$/] },
    { key: "物理", patterns: [/物理/, /^物$/] },
    { key: "化学", patterns: [/化学/, /^化$/] },
    { key: "地理", patterns: [/地理/, /^地$/] },
    { key: "历史", patterns: [/历史/, /^历$/] },
    { key: "政治", patterns: [/政治|思政|道法/, /^政$/] },
    { key: "生物", patterns: [/生物/, /^生$/] }
  ];

  const subjectCols = [];
  const conflicts = [];
  const candidatesBySubject = {};
  subjectPatterns.forEach((item) => {
    candidatesBySubject[item.key] = [];
  });

  headers.forEach((header, index) => {
    if (!header || index === nameCol) {
      return;
    }
    if (excludePattern.test(header)) {
      return;
    }
    subjectPatterns.forEach((subject) => {
      let score = 0;
      subject.patterns.forEach((pattern) => {
        if (pattern.test(header)) {
          score += header === subject.key ? 100 : 40;
          if (header.startsWith(subject.key)) {
            score += 10;
          }
        }
      });
      if (score > 0) {
        candidatesBySubject[subject.key].push({ index, score, header: rawHeaders[index] || `第${index + 1}列` });
      }
    });
  });

  Object.entries(candidatesBySubject).forEach(([subject, candidates]) => {
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1) {
      conflicts.push(`${subject}列重复：${candidates.map((item) => item.header).join("、")}`);
    }
    if (candidates.length) {
      subjectCols.push({ subject, index: candidates[0].index });
    }
  });

  if (nameCol === -1) {
    conflicts.push("未识别到姓名列");
  }
  if (subjectCols.length === 0) {
    conflicts.push("未识别到可用科目列");
  }

  const reliable = nameCol !== -1 && subjectCols.length > 0 && conflicts.length === 0;
  return {
    reliable,
    reason: reliable ? "ok" : "unreliable",
    headers: rawHeaders,
    nameCol,
    subjectCols,
    conflicts,
    candidatesBySubject
  };
}

function parseScoreRowsWithMapping(rows, mapping) {
  const entries = [];
  const subjectCols = mapping.subjectCols || [];
  const subjects = subjectCols.map((item) => item.subject);
  const nameCol = mapping.nameCol;
  const startIndex = rows.length ? 1 : 0;

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = nameCol !== -1 ? row[nameCol] : row[0];
    const name = rawName ? rawName.toString().trim() : "";
    if (!name) {
      continue;
    }

    const scores = {};
    subjectCols.forEach(({ index, subject }) => {
      const value = row[index];
      if (value !== undefined && value !== null && value !== "") {
        scores[subject] = value.toString().trim();
      }
    });

    entries.push({ name, scores });
  }

  return { subjects, entries };
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
  nameRow.className = "mapping-row";
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
    row.className = "mapping-row";
    const label = document.createElement("div");
    label.textContent = subject;
    const select = document.createElement("select");
    select.dataset.subject = subject;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "无";
    select.appendChild(none);
    headers.forEach((header, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = header || `第${index + 1}列`;
      if (
        suggestion &&
        suggestion.subjectCols?.some((item) => item.subject === subject && item.index === index)
      ) {
        option.selected = true;
      }
      const candidate = suggestion?.candidatesBySubject?.[subject]?.find((item) => item.index === index);
      if (candidate) {
        option.textContent = `${option.textContent}（推荐）`;
      }
      select.appendChild(option);
    });
    row.append(label, select);
    mappingList.appendChild(row);
  });

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

  const examName = scoreExamName.value.trim() || "考试";
  const examDate = scoreExamDate.value || new Date().toISOString().slice(0, 10);
  const examId = uid();

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
      scores: entry.scores
    });
    matched += 1;
  });

  state.exams.push({
    id: examId,
    name: examName,
    date: examDate,
    subjects: examDraft.subjects
  });

  saveState();
  renderSearchResults();
  renderSeatGrid();

  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamList(student);
    }
  }

  scoreStatus.textContent =
    unmatched.length > 0
      ? `已匹配 ${matched} 人，未匹配 ${unmatched.length} 人（可能由重名、别名未设置或姓名格式差异导致）。`
      : `已匹配 ${matched} 人，成绩已保存。`;
  saveScoreBtn.disabled = true;
  examDraft = null;
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
  renderWeekSelect(student);
  recordStudentName.textContent = `${student.name} · ${getWeekLabel(activeWeekKey)}`;
  recordNoteInput.value = "";
  recordModal.classList.remove("hidden");
  recordModal.setAttribute("aria-hidden", "false");
  renderRecordList();
  renderExamList(student);
  renderApplyList();
}

function closeRecordModal() {
  recordModal.classList.add("hidden");
  recordModal.setAttribute("aria-hidden", "true");
  activeStudentId = null;
  applyTargets = new Set();
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

function renderExamList(student) {
  examList.innerHTML = "";
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
      value.textContent = exam.scores?.[subject] ?? "-";
      item.append(label, value);
      scores.appendChild(item);
    });

    card.append(header, scores);
    examList.appendChild(card);
  });

  const hasCharts = renderExamTrends(sorted);
  exportTrendsBtn.disabled = false;
}

function renderExamTrends(exams) {
  examTrends.innerHTML = "";
  if (!exams.length) {
    return false;
  }

  const chronological = [...exams].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const labels = chronological.map((exam) => exam.date || exam.name || "考试");
  const totals = chronological.map((exam) => sumExamScores(exam.scores));
  const totalValues = totals.filter((value) => Number.isFinite(value));

  if (totalValues.length >= 2) {
    const card = createChartCard("总分趋势", labels, totals, {
      width: 360,
      height: 140,
      color: "#1c6f5f"
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
    const values = chronological.map((exam) => parseScoreValue(exam.scores?.[subject]));
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length < 2) {
      return;
    }
    hasSubjectChart = true;
    const card = createChartCard(`${subject}趋势`, labels, values, {
      width: 240,
      height: 120,
      color: "#f0b429"
    });
    subjectCards.appendChild(card);
  });

  if (hasSubjectChart) {
    examTrends.appendChild(subjectCards);
  } else if (!totalValues.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "暂无可用的成绩趋势数据。";
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
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

  setActivePillById("sec-common");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetId = pill.dataset.target;
      const section = sidebar.querySelector(`#${targetId}`);
      if (!section) {
        return;
      }
      setActivePillById(targetId);
      if (!section.open) {
        section.open = true;
      }
      setTimeout(() => {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        section.classList.remove("flash-highlight");
        void section.offsetWidth;
        section.classList.add("flash-highlight");
        setTimeout(() => section.classList.remove("flash-highlight"), 850);
      }, 40);
    });
  });

  sidebar.addEventListener("scroll", () => {
    const sidebarRect = sidebar.getBoundingClientRect();
    let bestId = "sec-common";
    let bestDistance = Number.POSITIVE_INFINITY;
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const distance = Math.abs(rect.top - sidebarRect.top - 54);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = section.id;
      }
    });
    setActivePillById(bestId);
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
  applyExamDraft();
});

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
  const subjectCols = [];
  mappingList.querySelectorAll("select[data-subject]").forEach((select) => {
    const subject = select.dataset.subject;
    if (select.value !== "") {
      subjectCols.push({ subject, index: Number.parseInt(select.value, 10) });
    }
  });
  if (!subjectCols.length) {
    alert("请至少选择一科成绩列。");
    return;
  }
  const usedCols = new Set();
  for (const item of subjectCols) {
    if (usedCols.has(item.index)) {
      alert("同一列被映射到多个科目，请调整后再导入。");
      return;
    }
    usedCols.add(item.index);
  }
  const mapping = {
    nameCol: Number.parseInt(nameValue, 10),
    subjectCols
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
