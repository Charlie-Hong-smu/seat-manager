const COLS = 8;
const STORAGE_KEY = "homeroom-seat-manager-v1";
const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];
const BACKUP_VERSION = 1;

const studentNameInput = document.getElementById("studentNameInput");
const studentGenderSelect = document.getElementById("studentGenderSelect");
const addStudentBtn = document.getElementById("addStudentBtn");
const studentSearchInput = document.getElementById("studentSearchInput");
const searchResults = document.getElementById("searchResults");
const studentCount = document.getElementById("studentCount");
const seatTotal = document.getElementById("seatTotal");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");

const drawCount = document.getElementById("drawCount");
const noRepeat = document.getElementById("noRepeat");
const drawBtn = document.getElementById("drawBtn");
const resetDrawBtn = document.getElementById("resetDrawBtn");
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

const scoreFileInput = document.getElementById("scoreFileInput");
const parseScoreBtn = document.getElementById("parseScoreBtn");
const scoreExamName = document.getElementById("scoreExamName");
const scoreExamDate = document.getElementById("scoreExamDate");
const saveScoreBtn = document.getElementById("saveScoreBtn");
const scoreStatus = document.getElementById("scoreStatus");

const saveHistoryBtn = document.getElementById("saveHistoryBtn");
const historyList = document.getElementById("historyList");

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

const mappingModal = document.getElementById("mappingModal");
const mappingList = document.getElementById("mappingList");
const mappingClose = document.getElementById("mappingClose");
const mappingCancel = document.getElementById("mappingCancel");
const mappingApply = document.getElementById("mappingApply");
const toast = document.getElementById("toast");
const easterModal = document.getElementById("easterModal");
const easterText = document.getElementById("easterText");
const easterClose = document.getElementById("easterClose");

let state = loadState();
let activeStudentId = null;
let dragSourceIndex = null;
let swapHighlight = new Set();
let activeWeekKey = getWeekKey(new Date());
let examDraft = null;
let mappingState = null;
let applyTargets = new Set();
let lastEasterAt = 0;

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

function showToast(message) {
  if (!toast) {
    return;
  }
  toast.textContent = message;
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
    seatHistory: [],
    exams: [],
    settings: {
      sidebarCollapsed: false,
      pairByGender: false
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
    exams: Array.isArray(student.exams) ? student.exams : []
  }));
  state.seatOrder = Array.isArray(state.seatOrder) ? state.seatOrder : [];
  state.seatHistory = Array.isArray(state.seatHistory) ? state.seatHistory : [];
  state.exams = Array.isArray(state.exams) ? state.exams : [];
  state.settings = state.settings || { sidebarCollapsed: false, pairByGender: false };
  state.settings.sidebarCollapsed = Boolean(state.settings.sidebarCollapsed);
  state.settings.pairByGender = Boolean(state.settings.pairByGender);
  state.draw = state.draw || { noRepeat: false, used: [], history: [] };
  state.draw.used = Array.isArray(state.draw.used) ? state.draw.used : [];
  state.draw.history = Array.isArray(state.draw.history) ? state.draw.history : [];

  normalizeSeatOrder();
  migrateDrawPool();
  pruneDrawUsed();
  pruneSeatHistory();
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

function addStudent(name, genderValue = "") {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }

  state.students.push({
    id: uid(),
    name: trimmed,
    gender: genderValue || "",
    records: [],
    exams: []
  });
  normalizeSeatOrder();
  placeStudentInFirstEmpty(state.students[state.students.length - 1].id);
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
  const matched = query
    ? state.students.filter((student) => student.name.includes(query))
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

function renderSeatGrid() {
  seatGroups.innerHTML = "";

  const getStudentById = (id) => state.students.find((student) => student.id === id);
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
        const student = studentId ? getStudentById(studentId) : null;

        const seat = document.createElement("div");
        seat.className = "seat";
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

        if (student && student.gender) {
          const gender = document.createElement("div");
          gender.className = "seat-meta gender";
          gender.textContent = `性别：${student.gender}`;
          seat.append(name, meta, gender, label);
        } else {
          seat.append(name, meta, label);
        }

        if (swapHighlight.has(index)) {
          seat.classList.add("swap-animate");
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

function shuffleSeats() {
  if (pairByGender.checked) {
    state.seatOrder = buildSeatOrderWithGenderPairs();
  } else {
    const array = [...state.seatOrder];
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    state.seatOrder = array;
  }
  saveState();
  renderSeatGrid();
}

function resetSeats() {
  const seatCount = getSeatCapacityFromCount(state.students.length);
  const order = new Array(seatCount).fill(null);
  state.students.forEach((student, index) => {
    if (index < seatCount) {
      order[index] = student.id;
    }
  });
  state.seatOrder = order;
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

  const pickedStudents = result.picked
    .map((id) => state.students.find((student) => student.id === id))
    .filter(Boolean);

  const names = pickedStudents.map((student) => student.name);

  state.draw.history.unshift({
    time: new Date().toISOString(),
    names
  });
  state.draw.history = state.draw.history.slice(0, 6);

  saveState();
  renderDrawResults();
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
  const rowCount = getRowCount();
  const snapshot = {
    id: uid(),
    time: new Date().toISOString(),
    rows: rowCount,
    seats: state.seatOrder.map((id) => {
      const student = state.students.find((item) => item.id === id);
      return student ? student.name : "";
    })
  };
  state.seatHistory.unshift(snapshot);
  pruneSeatHistory();
  saveState();
  renderHistoryList();
}

function renderHistoryList() {
  historyList.innerHTML = "";
  if (!state.seatHistory.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无历史座位记录。";
    historyList.appendChild(empty);
    return;
  }

  state.seatHistory.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const count = item.seats.filter((name) => name).length;
    meta.textContent = `${formatDateTime(item.time)} · ${count} 人`;

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
  saveState();
  renderAll();
}

function openHistoryModal(snapshot) {
  historyTitle.textContent = `历史座位表 · ${formatDateTime(snapshot.time)}`;
  renderHistoryGrid(snapshot.seats, snapshot.rows);
  historyModal.classList.remove("hidden");
  historyModal.setAttribute("aria-hidden", "false");
}

function closeHistoryModal() {
  historyModal.classList.add("hidden");
  historyModal.setAttribute("aria-hidden", "true");
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
      const student = { id: uid(), name, gender, records: [], exams: [] };
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
      const student = { id: uid(), name, gender, records: [], exams: [] };
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
      const student = { id: uid(), name, gender, records: [], exams: [] };
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
  saveState();
  renderAll();
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
}

function exportBackupJson() {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
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
  showToast("备份已导出");
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
      renderAll();
      showToast("备份已导入");
    })
    .catch(() => {
      showToast("备份导入失败");
    });
}

function detectScoreMapping(rows) {
  if (!rows.length) {
    return { reliable: false, reason: "empty", headers: [], nameCol: -1, subjectCols: [] };
  }

  const rawHeaders = rows[0].map((cell) => cell.toString().trim());
  const headers = rawHeaders.map((cell) => normalizeHeader(cell));
  const nameCol = rawHeaders.findIndex((cell, index) => {
    const normalized = headers[index];
    return /姓名|名字|学生/.test(normalized);
  });

  const excludePattern =
    /总分|总成绩|排名|名次|位次|学号|班级|考号|准考证|考场|座位|组别|年级|性别/;

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
  const seenSubjects = new Map();
  const conflicts = [];

  headers.forEach((header, index) => {
    if (!header || index === nameCol) {
      return;
    }
    if (excludePattern.test(header)) {
      return;
    }
    const matched = subjectPatterns.find((subject) =>
      subject.patterns.some((pattern) => pattern.test(header))
    );
    if (matched) {
      if (seenSubjects.has(matched.key)) {
        conflicts.push(matched.key);
      } else {
        seenSubjects.set(matched.key, index);
        subjectCols.push({ index, subject: matched.key });
      }
    }
  });

  const reliable = nameCol !== -1 && subjectCols.length > 0 && conflicts.length === 0;
  return {
    reliable,
    reason: reliable ? "ok" : "unreliable",
    headers: rawHeaders,
    nameCol,
    subjectCols,
    conflicts
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
    const key = normalizeName(student.name);
    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }
    nameMap.get(key).push(student);
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
      ? `已匹配 ${matched} 人，未匹配 ${unmatched.length} 人（姓名不一致）。`
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
  const candidates = state.students.filter((student) => student.id !== activeStudentId);
  const filtered = query ? candidates.filter((student) => student.name.includes(query)) : candidates;

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
    exportTrendsBtn.disabled = true;
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
  exportTrendsBtn.disabled = !hasCharts;
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

function renderAll() {
  normalizeState();
  renderSearchResults();
  seatTotal.textContent = getSeatCapacity().toString();
  renderRowLabels();
  renderSeatGrid();
  renderHistoryList();
  noRepeat.checked = Boolean(state.draw.noRepeat);
  pairByGender.checked = Boolean(state.settings.pairByGender);
  renderDrawResults();
  if (!importStatus.textContent) {
    importStatus.textContent = "Excel 表建议包含「姓名」列，可选「行」「列」「性别」定位。";
  }
  if (!scoreStatus.textContent) {
    scoreStatus.textContent = "成绩表格式：行=学生，列=科目（语数英物化地历政生）。";
  }
  applySidebarState();
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
  addStudent(studentNameInput.value, studentGenderSelect.value);
  maybeShowEasterEgg(studentNameInput.value);
  studentNameInput.value = "";
  studentGenderSelect.value = "";
  studentNameInput.focus();
});

studentNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addStudent(studentNameInput.value, studentGenderSelect.value);
    maybeShowEasterEgg(studentNameInput.value);
    studentNameInput.value = "";
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
    showToast("请选择备份文件");
    return;
  }
  importBackupJson(importBackupInput.files[0]);
  importBackupInput.value = "";
});

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

drawBtn.addEventListener("click", () => {
  drawNames();
});

resetDrawBtn.addEventListener("click", () => {
  resetDrawPool();
  renderDrawResults();
});

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
  exportTrendsPdf();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!recordModal.classList.contains("hidden")) {
      closeRecordModal();
    }
    if (!historyModal.classList.contains("hidden")) {
      closeHistoryModal();
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
renderAll();
