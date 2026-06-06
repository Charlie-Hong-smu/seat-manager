const COLS = 8;
const STORAGE_KEY = "homeroom-seat-manager-v1";
const AUTH_PERSIST_KEY = "seat-manager-authenticated";
const AUTH_SESSION_KEY = "seat-manager-session-authenticated";
const CUSTOM_PASSWORD_HASH_KEY = "seat-manager-password-hash";
const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];
const BACKUP_VERSION = 1;
const SIDEBAR_SECTION_STATE_KEY = "sidebarSectionOpen-v1";
const SIDEBAR_ACTIVE_TAB_KEY = "sidebarActiveTab-v1";
const SEAT_CARD_MODE_KEY = "seatCardMode-v2";
const AI_WORKER_URL_KEY = "seat-manager-ai-worker-url";
const AI_DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";
const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_REMEMBER_DAYS = 30;
const AI_REQUEST_LIMIT_BYTES = 20 * 1024;
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
  { id: "physics_strong", labelZh: "物理强", kind: "academic", groupId: "lvl_physics", groupNameZh: "物理水平" },
  { id: "physics_mid", labelZh: "物理中", kind: "academic", groupId: "lvl_physics", groupNameZh: "物理水平" },
  { id: "physics_weak", labelZh: "物理弱", kind: "academic", groupId: "lvl_physics", groupNameZh: "物理水平" },
  { id: "chemistry_strong", labelZh: "化学强", kind: "academic", groupId: "lvl_chemistry", groupNameZh: "化学水平" },
  { id: "chemistry_mid", labelZh: "化学中", kind: "academic", groupId: "lvl_chemistry", groupNameZh: "化学水平" },
  { id: "chemistry_weak", labelZh: "化学弱", kind: "academic", groupId: "lvl_chemistry", groupNameZh: "化学水平" },
  { id: "geo_strong", labelZh: "地理强", kind: "academic", groupId: "lvl_geo", groupNameZh: "地理水平" },
  { id: "geo_mid", labelZh: "地理中", kind: "academic", groupId: "lvl_geo", groupNameZh: "地理水平" },
  { id: "geo_weak", labelZh: "地理弱", kind: "academic", groupId: "lvl_geo", groupNameZh: "地理水平" },
  { id: "history_strong", labelZh: "历史强", kind: "academic", groupId: "lvl_history", groupNameZh: "历史水平" },
  { id: "history_mid", labelZh: "历史中", kind: "academic", groupId: "lvl_history", groupNameZh: "历史水平" },
  { id: "history_weak", labelZh: "历史弱", kind: "academic", groupId: "lvl_history", groupNameZh: "历史水平" },
  { id: "politics_strong", labelZh: "政治强", kind: "academic", groupId: "lvl_politics", groupNameZh: "政治水平" },
  { id: "politics_mid", labelZh: "政治中", kind: "academic", groupId: "lvl_politics", groupNameZh: "政治水平" },
  { id: "politics_weak", labelZh: "政治弱", kind: "academic", groupId: "lvl_politics", groupNameZh: "政治水平" },
  { id: "biology_strong", labelZh: "生物强", kind: "academic", groupId: "lvl_biology", groupNameZh: "生物水平" },
  { id: "biology_mid", labelZh: "生物中", kind: "academic", groupId: "lvl_biology", groupNameZh: "生物水平" },
  { id: "biology_weak", labelZh: "生物弱", kind: "academic", groupId: "lvl_biology", groupNameZh: "生物水平" },
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
  英语: "lvl_en",
  物理: "lvl_physics",
  化学: "lvl_chemistry",
  地理: "lvl_geo",
  历史: "lvl_history",
  政治: "lvl_politics",
  生物: "lvl_biology"
};
const COMPLEMENT_RULES = [
  { id: "talk_quiet", labelZh: "爱讲话 ↔ 沉默", leftTagId: "talkative", rightTagId: "quiet" },
  { id: "focus_balance", labelZh: "容易分心 ↔ 专注", leftTagId: "distractible", rightTagId: "focused" },
  { id: "role_balance", labelZh: "主动 ↔ 配合", leftTagId: "leader", rightTagId: "supporter" },
  { id: "cn_balance", labelZh: "语文强 ↔ 语文弱", leftTagId: "cn_strong", rightTagId: "cn_weak" },
  { id: "math_balance", labelZh: "数学强 ↔ 数学弱", leftTagId: "math_strong", rightTagId: "math_weak" },
  { id: "en_balance", labelZh: "英语强 ↔ 英语弱", leftTagId: "en_strong", rightTagId: "en_weak" }
];

const appRoot = document.getElementById("appRoot");
const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const loginHint = document.getElementById("loginHint");
const loginAccountField = document.getElementById("loginAccountField");
const loginAccount = document.getElementById("loginAccount");
const loginPassword = document.getElementById("loginPassword");
const loginSetupConfirmField = document.getElementById("loginSetupConfirmField");
const loginSetupConfirm = document.getElementById("loginSetupConfirm");
const loginRemember = document.getElementById("loginRemember");
const loginError = document.getElementById("loginError");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const changePasswordModal = document.getElementById("changePasswordModal");
const changePasswordForm = document.getElementById("changePasswordForm");
const changePasswordClose = document.getElementById("changePasswordClose");
const changePasswordCancel = document.getElementById("changePasswordCancel");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const changePasswordError = document.getElementById("changePasswordError");
const logoutBtn = document.getElementById("logoutBtn");
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
const drawHistoryDetails = document.getElementById("drawHistoryDetails");
const drawHistorySummary = document.getElementById("drawHistorySummary");

const shuffleSeatsBtn = document.getElementById("shuffleSeatsBtn");
const resetSeatsBtn = document.getElementById("resetSeatsBtn");
const undoSeatChangeBtn = document.getElementById("undoSeatChangeBtn");
const pairByGender = document.getElementById("pairByGender");
const seatRuleStatus = document.getElementById("seatRuleStatus");
const seatRuleSummaryChips = document.getElementById("seatRuleSummaryChips");

const importFileInput = document.getElementById("importFileInput");
const importReplace = document.getElementById("importReplace");
const importKeepHistory = document.getElementById("importKeepHistory");
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
const savedExamList = document.getElementById("savedExamList");
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
const seatEmptyState = document.getElementById("seatEmptyState");

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
const aiTrendBtn = document.getElementById("aiTrendBtn");
const aiTrendResult = document.getElementById("aiTrendResult");
const aiAuthModal = document.getElementById("aiAuthModal");
const aiAuthClose = document.getElementById("aiAuthClose");
const aiAuthCancel = document.getElementById("aiAuthCancel");
const aiAuthSubmit = document.getElementById("aiAuthSubmit");
const aiWorkerUrlInput = document.getElementById("aiWorkerUrlInput");
const aiAccessCodeInput = document.getElementById("aiAccessCodeInput");
const aiRememberInput = document.getElementById("aiRememberInput");
const aiAuthError = document.getElementById("aiAuthError");
const classAiTrendBtn = document.getElementById("classAiTrendBtn");
const classAiTrendResult = document.getElementById("classAiTrendResult");
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
const shufflePreviewModal = document.getElementById("shufflePreviewModal");
const shufflePreviewClose = document.getElementById("shufflePreviewClose");
const shufflePreviewSummary = document.getElementById("shufflePreviewSummary");
const shufflePreviewSeatGrid = document.getElementById("shufflePreviewSeatGrid");
const shufflePreviewDetails = document.getElementById("shufflePreviewDetails");
const shufflePreviewAgain = document.getElementById("shufflePreviewAgain");
const shufflePreviewCancel = document.getElementById("shufflePreviewCancel");
const shufflePreviewApply = document.getElementById("shufflePreviewApply");

const mappingModal = document.getElementById("mappingModal");
const mappingList = document.getElementById("mappingList");
const mappingConflicts = document.getElementById("mappingConflicts");
const mappingClose = document.getElementById("mappingClose");
const mappingCancel = document.getElementById("mappingCancel");
const mappingApply = document.getElementById("mappingApply");
const savedExamTableModal = document.getElementById("savedExamTableModal");
const savedExamTableTitle = document.getElementById("savedExamTableTitle");
const savedExamTableMeta = document.getElementById("savedExamTableMeta");
const savedExamSearchInput = document.getElementById("savedExamSearchInput");
const savedExamSearchBtn = document.getElementById("savedExamSearchBtn");
const savedExamSearchResults = document.getElementById("savedExamSearchResults");
const savedExamSearchStatus = document.getElementById("savedExamSearchStatus");
const savedExamTableWrap = document.getElementById("savedExamTableWrap");
const savedExamTableClose = document.getElementById("savedExamTableClose");
const trendDetailModal = document.getElementById("trendDetailModal");
const trendDetailTitle = document.getElementById("trendDetailTitle");
const trendDetailMeta = document.getElementById("trendDetailMeta");
const trendDetailList = document.getElementById("trendDetailList");
const trendDetailClose = document.getElementById("trendDetailClose");
const toast = document.getElementById("toast");
const updatePrompt = document.getElementById("updatePrompt");
const updateNowBtn = document.getElementById("updateNowBtn");
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
const complementRuleSettings = document.getElementById("complementRuleSettings");

let state = loadState();
let activeStudentId = null;
let dragSourceIndex = null;
let dragAutoScrollFrame = null;
let dragAutoScrollY = 0;
let dragAutoScrollX = 0;
let previewDragSourceIndex = null;
let previewSuppressNextClick = false;
let swapHighlight = new Set();
let pendingSeatFlip = [];
let activeWeekKey = getWeekKey(new Date());
let examDraft = null;
let mappingState = null;
let applyTargets = new Set();
let lastEasterAt = 0;
let backupReminderChecked = false;
let allowAcademicOverride = false;
let pendingShufflePreview = null;
let activeShufflePreviewDetail = "required";
const seatUndoStack = [];
let examTrendMode = "all";
let expandedSavedExamIds = new Set();
let activeSavedExamTableId = "";
const inputSuggestMap = new Map();

function isAuthenticated() {
  return localStorage.getItem(AUTH_PERSIST_KEY) === "true" || sessionStorage.getItem(AUTH_SESSION_KEY) === "true";
}

function hasLoginPassword() {
  return Boolean(localStorage.getItem(CUSTOM_PASSWORD_HASH_KEY));
}

function updateLoginMode() {
  const isSetup = !hasLoginPassword();
  loginAccountField?.classList.add("hidden");
  loginSetupConfirmField?.classList.toggle("hidden", !isSetup);
  if (loginHint) {
    loginHint.textContent = isSetup ? "首次使用请设置本机登录密码。" : "请输入密码后继续使用。";
  }
  if (loginPassword) {
    loginPassword.placeholder = isSetup ? "请设置密码" : "请输入密码";
    loginPassword.autocomplete = isSetup ? "new-password" : "current-password";
  }
  if (loginRemember) {
    loginRemember.checked = false;
  }
}

function setAuthenticated(remember) {
  if (remember) {
    localStorage.setItem(AUTH_PERSIST_KEY, "true");
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, "true");
    localStorage.removeItem(AUTH_PERSIST_KEY);
  }
}

function showLogin() {
  loginScreen?.classList.remove("hidden");
  appRoot?.classList.add("hidden");
  loginForm?.reset();
  updateLoginMode();
  if (loginError) {
    loginError.textContent = "";
  }
  setTimeout(() => loginPassword?.focus(), 0);
}

function showApp() {
  loginScreen?.classList.add("hidden");
  appRoot?.classList.remove("hidden");
}

function clearAuth() {
  localStorage.removeItem(AUTH_PERSIST_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password) {
  const customHash = localStorage.getItem(CUSTOM_PASSWORD_HASH_KEY);
  return Boolean(customHash) && (await hashPassword(password)) === customHash;
}

function openChangePasswordModal() {
  changePasswordModal?.classList.remove("hidden");
  changePasswordModal?.setAttribute("aria-hidden", "false");
  changePasswordForm?.reset();
  if (changePasswordError) {
    changePasswordError.textContent = "";
  }
  setTimeout(() => currentPasswordInput?.focus(), 0);
}

function closeChangePasswordModal() {
  changePasswordModal?.classList.add("hidden");
  changePasswordModal?.setAttribute("aria-hidden", "true");
  changePasswordForm?.reset();
  if (changePasswordError) {
    changePasswordError.textContent = "";
  }
}

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

const PINYIN_CHAR_GROUPS = {
  a: "阿啊呵吖腌锕",
  ai: "爱矮挨哎艾碍哀癌隘蔼皑埃嗳嫒瑷暧",
  an: "安按暗岸俺案鞍氨胺庵谙铵鹌黯",
  ang: "昂盎肮",
  ao: "奥傲熬凹敖澳袄懊翱鳌嗷拗",
  ba: "八把爸巴吧拔罢霸坝芭叭疤扒靶跋",
  bai: "白百柏败摆拜佰伯稗",
  ban: "半办班般板伴搬斑版扮拌瓣颁扳绊",
  bang: "帮棒邦榜膀绑傍磅蚌镑",
  bao: "包宝报保抱暴胞薄堡饱爆鲍褒刨豹瀑曝",
  bei: "北被备背杯贝倍悲碑辈卑呗蓓惫焙",
  ben: "本奔苯笨贲",
  beng: "崩蹦绷甭泵蚌迸",
  bi: "比必笔毕闭避鼻彼碧币逼壁臂弊陛璧彬斌宾滨冰兵秉柄炳并病屏",
  bian: "边变便遍编辩扁贬鞭辨卞辫匾",
  biao: "表标彪膘镖飙裱",
  bie: "别憋鳖瘪",
  bin: "宾斌彬滨濒缤",
  bing: "并病兵冰饼柄丙秉炳屏",
  bo: "波博伯播泊玻薄勃拨柏驳搏脖卜帛舶渤钵",
  bu: "不部步布补捕卜簿怖哺埠",
  ca: "擦嚓",
  cai: "才菜财采材彩蔡裁猜睬",
  can: "参残餐灿惭惨蚕璨",
  cang: "藏仓苍舱沧",
  cao: "草操曹槽糙嘈",
  ce: "册侧测策厕",
  cen: "岑涔",
  ceng: "曾层蹭噌",
  cha: "查差茶插察叉茬刹诧岔碴",
  chai: "柴拆差豺钗",
  chan: "产单缠禅蝉搀颤铲馋阐婵",
  chang: "长常场厂唱昌畅尝肠偿敞倡昶",
  chao: "朝超潮吵炒抄巢钞嘲",
  che: "车彻撤扯澈掣",
  chen: "陈晨辰沉尘臣称琛宸趁衬忱",
  cheng: "成程城承呈诚乘盛澄橙逞惩秤丞",
  chi: "吃持迟池赤尺齿驰痴翅斥耻炽",
  chong: "冲重充崇虫宠",
  chou: "抽愁仇臭筹酬丑绸畴",
  chu: "出处初除楚触础储厨畜雏橱",
  chuai: "揣踹啜",
  chuan: "传船穿川串喘椽",
  chuang: "创床窗闯疮",
  chui: "吹垂锤炊",
  chun: "春纯唇醇淳蠢",
  chuo: "戳绰辍",
  ci: "此次词刺辞慈磁瓷茨赐",
  cong: "从聪丛葱匆囱",
  cou: "凑",
  cu: "粗促醋簇",
  cuan: "窜篡攒蹿",
  cui: "崔脆翠催摧粹淬",
  cun: "村存寸",
  cuo: "错措搓撮挫",
  da: "大达答打搭哒妲沓",
  dai: "代带待戴袋呆贷逮怠歹黛岱",
  dan: "但单蛋淡担丹胆旦弹氮耽诞郸",
  dang: "当党档挡荡堂趟",
  dao: "到道导岛倒刀盗稻悼蹈",
  de: "的得德地",
  deng: "等登邓灯澄瞪凳蹬",
  di: "地点第低底弟帝敌递抵滴迪蒂笛狄棣",
  dian: "点电店典殿淀垫颠滇甸",
  diao: "调掉雕吊钓刁貂",
  die: "爹跌叠蝶碟谍迭",
  ding: "定顶丁订盯鼎钉叮",
  diu: "丢",
  dong: "东动懂冬董洞栋冻侗",
  dou: "都斗豆逗抖兜陡窦",
  du: "度都读独毒杜督堵渡肚赌睹",
  duan: "段短端断缎锻",
  dui: "对队堆兑",
  dun: "吨顿盾蹲敦墩钝",
  duo: "多夺朵躲舵堕跺惰铎",
  e: "饿俄额恶鹅娥峨鄂扼遏蛾",
  en: "恩嗯",
  er: "而二儿尔耳洱饵贰",
  fa: "发法罚伐乏筏阀",
  fan: "反饭范凡番犯翻烦返泛帆繁樊梵",
  fang: "方放房防芳访纺坊仿妨",
  fei: "非飞费肥废菲肺匪斐啡沸",
  fen: "分份粉芬奋愤纷坟汾",
  feng: "风封峰丰锋凤冯逢奉疯枫蜂",
  fo: "佛",
  fou: "否",
  fu: "服副府富福夫父复负付附符傅浮妇扶幅伏赴腹抚芙甫辅",
  ga: "噶咖尬",
  gai: "该改概盖钙丐",
  gan: "感干敢赶甘杆肝赣竿柑",
  gang: "刚港钢岗纲缸冈杠",
  gao: "高告搞稿膏糕皋",
  ge: "个各格歌哥革隔葛阁戈鸽割胳",
  gei: "给",
  gen: "跟根亘艮",
  geng: "更耕庚耿梗羹",
  gong: "公共工功供宫攻恭巩龚拱",
  gou: "够沟狗构购勾苟钩",
  gu: "古故股顾谷鼓固姑孤骨估菇辜沽",
  gua: "挂刮瓜寡卦",
  guai: "怪乖拐",
  guan: "关管官观馆冠惯贯罐灌莞",
  guang: "光广逛",
  gui: "规贵归鬼桂柜轨硅瑰圭",
  gun: "滚棍",
  guo: "国过果郭锅裹帼",
  ha: "哈蛤",
  hai: "还海孩害骇亥",
  han: "汉韩寒含汗涵喊函翰罕憾瀚",
  hang: "行航杭巷沆",
  hao: "好号浩豪毫昊皓耗郝灏",
  he: "和何河合喝赫荷贺盒鹤禾核呵",
  hei: "黑",
  hen: "很狠恨痕",
  heng: "横衡恒哼亨",
  hong: "红洪宏鸿虹弘哄烘泓",
  hou: "后候厚侯猴喉",
  hu: "湖户胡虎护呼忽互壶狐沪乎",
  hua: "化华花画话滑桦哗",
  huai: "怀坏淮槐",
  huan: "欢环换还缓幻焕桓唤宦",
  huang: "黄荒皇煌慌凰晃璜",
  hui: "会回灰辉慧惠汇毁恢晖徽绘",
  hun: "混婚魂昏浑",
  huo: "或活火货获伙霍祸惑",
  ji: "及机几己记基即极计集级急技纪际季既济鸡吉寄绩激继姬积籍肌疾寂佳嘉家稽",
  jia: "家加价假架甲佳嘉贾嫁夹驾颊珈迦",
  jian: "见间件建简坚检减剑健肩兼键箭尖鉴荐践俭舰柬茧",
  jiang: "将江讲奖降姜蒋疆匠浆",
  jiao: "教交叫较角脚焦娇校骄郊椒蕉缴",
  jie: "接节界姐解结街杰借介洁捷截阶揭皆届",
  jin: "进今金近尽仅紧锦晋津劲谨瑾",
  jing: "经京精静景竟敬镜晶井竞净惊靖璟",
  jiong: "炯迥窘",
  jiu: "就九酒久旧救舅纠究玖",
  ju: "局据举具句剧居巨聚拒菊矩俱距炬",
  juan: "卷捐娟倦眷绢",
  jue: "决绝觉角掘爵诀珏",
  jun: "军君均俊峻钧骏郡",
  ka: "卡咖喀",
  kai: "开凯慨楷恺",
  kan: "看砍刊堪坎",
  kang: "康抗扛慷亢",
  kao: "考靠烤拷",
  ke: "可克科课客刻颗柯壳渴珂恪",
  ken: "肯恳啃垦",
  keng: "坑吭",
  kong: "空孔控恐",
  kou: "口扣寇",
  ku: "苦库哭酷裤窟",
  kua: "夸跨垮挎",
  kuai: "快块会筷侩",
  kuan: "宽款",
  kuang: "况矿狂框旷匡眶",
  kui: "亏奎魁馈愧窥葵",
  kun: "困昆坤琨捆",
  kuo: "扩阔括廓",
  la: "拉啦辣蜡腊喇",
  lai: "来赖莱徕",
  lan: "兰蓝览烂拦懒篮澜岚",
  lang: "浪郎朗狼廊琅",
  lao: "老劳牢捞姥烙",
  le: "了乐勒",
  lei: "类累雷泪蕾磊垒擂",
  leng: "冷楞棱",
  li: "里理力利立李丽离礼莉黎例厉励璃梨俐荔",
  lia: "俩",
  lian: "连联练莲恋脸炼链廉怜帘",
  liang: "两量良亮梁凉粮辆谅靓",
  liao: "了料疗聊辽廖寥",
  lie: "列烈裂猎劣",
  lin: "林临琳淋邻麟霖磷凛",
  ling: "领令另灵零玲凌岭铃龄陵",
  liu: "六流留刘柳溜琉榴",
  long: "龙隆弄笼聋拢",
  lou: "楼漏露娄陋",
  lu: "路录陆鲁卢鹿露炉芦禄璐",
  lv: "吕绿律旅率虑履侣",
  luan: "乱卵峦栾",
  lue: "略掠",
  lun: "论轮伦仑",
  luo: "罗落洛络裸骆萝螺",
  ma: "吗妈马麻骂码玛",
  mai: "买卖麦埋迈",
  man: "满慢曼漫蛮馒瞒",
  mang: "忙芒盲莽",
  mao: "毛冒贸帽貌猫茂矛卯",
  me: "么麽",
  mei: "没美每妹梅眉煤玫枚媚魅",
  men: "们门闷",
  meng: "梦孟蒙猛萌盟",
  mi: "米密迷秘蜜弥谜",
  mian: "面免棉眠绵缅",
  miao: "秒苗妙庙描瞄淼",
  mie: "灭蔑",
  min: "民敏闵皿珉",
  ming: "名明命鸣铭冥",
  miu: "谬",
  mo: "莫末模魔摸磨墨默膜漠沫茉",
  mou: "某谋牟",
  mu: "目木母幕亩牧穆慕沐",
  na: "那拿哪纳娜钠",
  nai: "乃奶耐奈",
  nan: "南难男楠喃",
  nang: "囊",
  nao: "脑闹恼挠瑙",
  ne: "呢讷",
  nei: "内馁",
  nen: "嫩",
  neng: "能",
  ni: "你尼呢泥拟逆妮",
  nian: "年念黏碾",
  niang: "娘酿",
  niao: "鸟尿",
  nie: "捏聂涅",
  nin: "您",
  ning: "宁凝拧柠甯",
  niu: "牛扭纽妞",
  nong: "农浓弄",
  nu: "努怒奴",
  nv: "女",
  nuan: "暖",
  nuo: "诺挪懦糯娜",
  o: "哦噢",
  ou: "欧偶呕藕鸥",
  pa: "怕爬帕趴",
  pai: "派排牌拍徘",
  pan: "盘判潘盼攀畔",
  pang: "旁胖庞乓",
  pao: "跑炮泡抛袍",
  pei: "配陪培赔佩沛裴",
  pen: "喷盆",
  peng: "朋鹏彭碰捧蓬棚膨",
  pi: "批皮披匹脾疲僻辟屁霹",
  pian: "片篇偏骗翩",
  piao: "票飘漂朴嫖",
  pie: "撇瞥",
  pin: "品贫拼频聘",
  ping: "平评瓶凭萍屏苹坪",
  po: "破坡婆迫颇泼魄",
  pou: "剖",
  pu: "普铺谱浦朴扑葡蒲璞",
  qi: "其起期气七器奇齐企启骑弃琪祺琦棋旗岂妻栖",
  qia: "恰卡掐",
  qian: "前千钱浅签欠牵潜倩乾谦茜",
  qiang: "强枪墙抢腔羌",
  qiao: "桥巧乔悄敲瞧俏侨翘",
  qie: "切且怯窃茄",
  qin: "亲秦琴勤沁钦芹",
  qing: "请清情青轻庆倾晴卿擎",
  qiong: "穷琼穹",
  qiu: "求球秋邱丘囚",
  qu: "去区取曲趣趋屈渠瞿",
  quan: "全权圈泉拳劝犬",
  que: "却确缺雀鹊",
  qun: "群裙",
  ran: "然染燃冉",
  rang: "让嚷壤",
  rao: "绕扰饶",
  re: "热惹",
  ren: "人任认仁忍刃韧",
  reng: "仍扔",
  ri: "日",
  rong: "荣容融蓉榕绒",
  rou: "肉柔揉",
  ru: "如入乳茹儒汝",
  ruan: "软阮",
  rui: "瑞锐睿蕊芮",
  run: "润闰",
  ruo: "若弱偌",
  sa: "撒洒萨",
  sai: "赛塞腮",
  san: "三散伞叁",
  sang: "桑嗓丧",
  sao: "扫嫂骚",
  se: "色瑟涩",
  sen: "森",
  seng: "僧",
  sha: "沙杀纱傻厦莎",
  shai: "晒筛",
  shan: "山善闪衫扇珊杉陕姗",
  shang: "上商伤尚赏裳",
  shao: "少绍烧稍邵哨",
  she: "社设射舍蛇摄舌奢",
  shen: "什身深神沈甚申伸慎肾参",
  sheng: "生声省胜升盛圣剩绳晟",
  shi: "是时十事实使世师市始式识史士石诗室试适视施氏思",
  shou: "手受收首守寿瘦授",
  shu: "书数树属术叔输熟舒述暑束淑蜀",
  shua: "刷耍",
  shuai: "帅摔甩率",
  shuan: "栓拴",
  shuang: "双爽霜",
  shui: "水谁税睡",
  shun: "顺瞬舜",
  shuo: "说硕朔烁",
  si: "四思死斯司私丝寺似嗣",
  song: "送松宋诵颂嵩",
  sou: "搜艘嗖",
  su: "苏素速诉俗宿肃粟",
  suan: "算酸蒜",
  sui: "岁随虽碎穗遂隋",
  sun: "孙损笋",
  suo: "所索锁缩梭",
  ta: "他她它塔踏塌",
  tai: "太台态泰抬胎钛",
  tan: "谈探坦叹滩弹谭坛檀",
  tang: "堂唐糖汤趟塘棠",
  tao: "套讨逃桃涛陶掏滔",
  te: "特忒",
  teng: "疼腾藤滕",
  ti: "体题提替踢梯啼",
  tian: "天田填甜添恬",
  tiao: "条跳调挑迢",
  tie: "铁贴帖",
  ting: "听停庭挺亭婷廷",
  tong: "同通统童痛铜桐彤瞳",
  tou: "头投透偷",
  tu: "土图突途徒吐兔涂屠",
  tuan: "团湍",
  tui: "推退腿褪",
  tun: "吞屯臀",
  tuo: "托脱拖妥拓陀驼",
  wa: "哇瓦挖娃洼",
  wai: "外歪",
  wan: "完万晚玩湾弯碗丸宛婉",
  wang: "王网往望忘亡汪旺",
  wei: "为位未微伟维卫威围委味魏唯惟炜薇玮",
  wen: "问文温闻稳纹雯",
  weng: "翁嗡",
  wo: "我握窝卧沃",
  wu: "无五物务武舞吴吾伍悟午雾乌巫",
  xi: "西系喜细习希息席洗戏吸惜溪熙锡曦夕兮",
  xia: "下夏吓霞峡侠厦暇",
  xian: "先现线县显限仙鲜贤宪险献闲咸弦娴",
  xiang: "想向象项乡相香湘祥翔享响",
  xiao: "小笑校消效晓萧肖孝潇霄",
  xie: "写些谢协鞋斜邪携械歇泄",
  xin: "新心信欣辛鑫馨芯昕",
  xing: "行性形星兴醒幸杏姓邢",
  xiong: "兄雄熊胸",
  xiu: "修秀休袖绣宿",
  xu: "需许续须徐序虚旭绪",
  xuan: "选宣旋玄轩萱璇",
  xue: "学雪血薛穴靴",
  xun: "寻讯训迅巡勋逊熏询",
  ya: "呀压亚牙雅押鸭丫崖",
  yan: "眼言研严演烟验颜燕岩沿炎彦艳延",
  yang: "样阳养杨洋央扬羊仰漾",
  yao: "要摇药腰姚咬耀遥尧瑶",
  ye: "也业夜爷叶野液页烨晔",
  yi: "一以已意义易亿衣医艺依移益异伊仪宜逸怡毅",
  yin: "因音引银印阴饮殷尹隐茵",
  ying: "应英影营迎硬赢颖映莹瑛樱",
  yo: "哟唷",
  yong: "用永勇拥泳咏雍",
  you: "有又由友右游优幼尤邮佑悠",
  yu: "于与语育玉雨余鱼遇予域宇羽瑜钰昱煜",
  yuan: "原员远元院愿园源袁圆缘媛苑",
  yue: "月越约乐悦岳跃阅粤玥",
  yun: "云运允韵孕匀芸",
  za: "杂砸咋",
  zai: "在再载灾仔宰",
  zan: "赞暂咱攒",
  zang: "脏藏葬",
  zao: "早造遭糟澡燥灶枣",
  ze: "则责择泽仄",
  zei: "贼",
  zen: "怎",
  zeng: "曾增赠憎",
  zha: "查扎炸眨渣榨乍札",
  zhai: "摘窄债宅寨",
  zhan: "站战展占沾斩瞻盏湛",
  zhang: "张章长掌账丈涨障彰",
  zhao: "找照赵招朝着召昭罩",
  zhe: "这着者折哲浙遮",
  zhen: "真阵镇针震珍振圳贞臻",
  zheng: "正政证整争郑征蒸睁铮峥",
  zhi: "之只知制至指直治志质支纸智织职止值芷",
  zhong: "中种重终钟众忠仲衷",
  zhou: "周州洲舟骤轴昼宙",
  zhu: "主住注助朱珠竹祝著筑逐柱",
  zhua: "抓爪",
  zhuai: "拽",
  zhuan: "专转传赚砖撰",
  zhuang: "装庄壮状撞妆",
  zhui: "追坠缀锥",
  zhun: "准谆",
  zhuo: "着桌卓捉浊灼琢",
  zi: "子自字资紫仔姿梓滋",
  zong: "总宗纵踪棕",
  zou: "走邹奏",
  zu: "组足族祖阻",
  zuan: "钻纂",
  zui: "最嘴罪醉",
  zun: "尊遵",
  zuo: "作做坐左座昨佐"
};

const PINYIN_BY_CHAR = (() => {
  const map = new Map();
  Object.entries(PINYIN_CHAR_GROUPS).forEach(([pinyin, chars]) => {
    Array.from(chars).forEach((char) => {
      if (!map.has(char)) {
        map.set(char, []);
      }
      map.get(char).push(pinyin);
    });
  });
  return map;
})();

function getNamePinyinParts(value) {
  const text = normalizeName(value);
  if (!text) {
    return [];
  }
  return Array.from(text).map((char) => {
    const lower = char.toLowerCase();
    if (/^[a-z0-9]$/.test(lower)) {
      return [lower];
    }
    return PINYIN_BY_CHAR.get(char) || [lower];
  });
}

function buildPinyinSearchKeys(value) {
  const parts = getNamePinyinParts(value);
  if (!parts.length) {
    return [];
  }
  const keys = new Set();
  const combinations = [[]];
  parts.forEach((items) => {
    const current = combinations.splice(0, combinations.length);
    current.forEach((combo) => {
      items.slice(0, 4).forEach((pinyin) => {
        if (combinations.length < 32) {
          combinations.push([...combo, pinyin]);
        }
      });
    });
  });
  combinations.forEach((combo) => {
    keys.add(combo.join(""));
    keys.add(combo.map((item) => item[0]).join(""));
    for (let index = 1; index < combo.length; index += 1) {
      const tail = combo.slice(index);
      keys.add(tail.join(""));
      keys.add(tail.map((item) => item[0]).join(""));
    }
  });
  parts.forEach((items) => {
    items.forEach((pinyin) => {
      if (pinyin.length > 1) {
        keys.add(pinyin);
      }
    });
  });
  return [...keys].filter(Boolean);
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

function registerOfflineApp() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let refreshing = false;
  let waitingWorker = null;

  const showUpdatePrompt = (worker) => {
    waitingWorker = worker;
    updatePrompt?.classList.remove("hidden");
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("./sw.js?v=20260605-seat-swap-flip")
    .then((registration) => {
      if (registration.waiting) {
        showUpdatePrompt(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const nextWorker = registration.installing;
        if (!nextWorker) {
          return;
        }
        nextWorker.addEventListener("statechange", () => {
          if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdatePrompt(nextWorker);
          }
        });
      });
    })
    .catch((error) => {
      console.warn("离线功能注册失败", error);
    });

  updateNowBtn?.addEventListener("click", () => {
    if (!waitingWorker) {
      window.location.reload();
      return;
    }
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
}

function maybeShowEasterEgg(triggerText) {
  const normalized = normalizeName(triggerText);
  const triggersA = new Set([normalizeName("洪丞林")]);
  const triggersB = new Set([normalizeName("张秋萍")]);
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
    savedExams: [],
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
      complementRuleIds: [],
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("无法保存本地数据", error);
    showToast("保存失败，请立即导出备份", "error");
    if (backupReminder && backupReminderText) {
      backupReminder.classList.remove("hidden");
      backupReminderText.textContent = "浏览器本地存储可能已满，请立即导出备份 JSON。";
    }
    return false;
  }
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
  state.savedExams = Array.isArray(state.savedExams) ? state.savedExams.map(normalizeSavedExamRecord).filter(Boolean) : [];
  state.lastBackupAt = state.lastBackupAt || "";
  state.settings = state.settings || {
    sidebarCollapsed: false,
    pairByGender: false,
    keepLockedEmpty: true,
    autoAcademic: {},
    complementRuleIds: [],
    constraints: {}
  };
  state.settings.sidebarCollapsed = Boolean(state.settings.sidebarCollapsed);
  state.settings.pairByGender = Boolean(state.settings.pairByGender);
  state.settings.keepLockedEmpty =
    state.settings.keepLockedEmpty === undefined ? true : Boolean(state.settings.keepLockedEmpty);
  state.settings.complementRuleIds = Array.isArray(state.settings.complementRuleIds)
    ? state.settings.complementRuleIds
        .map((id) => id?.toString().trim())
        .filter((id) => COMPLEMENT_RULES.some((rule) => rule.id === id))
    : [];
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
  for (let displayRow = 0; displayRow < rows; displayRow += 1) {
    const seatRow = rows - displayRow;
    const label = document.createElement("div");
    label.textContent = `第 ${seatRow} 行`;
    rowLabels.appendChild(label);
  }
}

function getSeatDataRowFromDisplayRow(displayRow, rows) {
  return rows - 1 - displayRow;
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

function getSeatPositionLabel(index) {
  if (index < 0) {
    return "未入座";
  }
  return `${Math.floor(index / COLS) + 1}-${(index % COLS) + 1}`;
}

function getSeatElementByIndex(index) {
  return document.querySelector(`.seat[data-index="${index}"]`);
}

function getSeatRectByIndex(index) {
  const el = getSeatElementByIndex(index);
  return el ? el.getBoundingClientRect() : null;
}

function queueSeatFlash(indices) {
  swapHighlight = new Set((indices || []).filter((index) => Number.isInteger(index) && index >= 0));
}

function queueSeatFlip(sourceIndex, targetIndex) {
  const sourceRect = getSeatRectByIndex(sourceIndex);
  const targetRect = getSeatRectByIndex(targetIndex);
  pendingSeatFlip = [];
  if (sourceRect && targetRect) {
    pendingSeatFlip.push({ index: targetIndex, from: sourceRect });
    pendingSeatFlip.push({ index: sourceIndex, from: targetRect });
  }
}

function playPendingSeatFlip() {
  if (!pendingSeatFlip.length) {
    return;
  }
  const animations = pendingSeatFlip
    .map((item) => {
      const el = getSeatElementByIndex(item.index);
      if (!el) {
        return null;
      }
      const to = el.getBoundingClientRect();
      const dx = item.from.left - to.left;
      const dy = item.from.top - to.top;
      if (!dx && !dy) {
        el.classList.add("swap-settle");
        return null;
      }
      el.classList.add("swap-moving", "swap-settle");
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      return el;
    })
    .filter(Boolean);
  pendingSeatFlip = [];
  requestAnimationFrame(() => {
    animations.forEach((el) => {
      el.style.transform = "";
    });
  });
  setTimeout(() => {
    document.querySelectorAll(".seat.swap-moving, .seat.swap-settle").forEach((item) => {
      item.classList.remove("swap-moving", "swap-settle");
      item.style.transform = "";
    });
  }, 520);
}

function cloneSeatSnapshot() {
  return {
    seatOrder: [...state.seatOrder],
    lockedSeats: [...state.lockedSeats]
  };
}

function hasSeatSnapshotChanged(snapshot) {
  if (!snapshot) {
    return false;
  }
  return (
    JSON.stringify(snapshot.seatOrder || []) !== JSON.stringify(state.seatOrder || []) ||
    JSON.stringify(snapshot.lockedSeats || []) !== JSON.stringify(state.lockedSeats || [])
  );
}

function pushSeatUndo(label, snapshot) {
  if (!hasSeatSnapshotChanged(snapshot)) {
    return;
  }
  seatUndoStack.push({
    label,
    seatOrder: [...snapshot.seatOrder],
    lockedSeats: [...snapshot.lockedSeats]
  });
  if (seatUndoStack.length > 8) {
    seatUndoStack.shift();
  }
  renderUndoSeatChange();
}

function renderUndoSeatChange() {
  if (!undoSeatChangeBtn) {
    return;
  }
  const latest = seatUndoStack[seatUndoStack.length - 1];
  undoSeatChangeBtn.disabled = !latest;
  undoSeatChangeBtn.textContent = latest ? `撤销${latest.label}` : "撤销上一步";
}

function undoSeatChange() {
  const snapshot = seatUndoStack.pop();
  if (!snapshot) {
    showToast("暂无可撤销的座位调整", "info");
    renderUndoSeatChange();
    return;
  }
  const before = [...state.seatOrder];
  state.seatOrder = [...snapshot.seatOrder];
  state.lockedSeats = [...snapshot.lockedSeats];
  normalizeLocks();
  queueSeatFlash(getChangedSeatIndices(before, state.seatOrder));
  saveState();
  renderAll();
  showToast(`已撤销${snapshot.label}`, "success");
}

function getSeatDisplayTags(student) {
  const tags = sortTagsForSeatDisplay(getEffectiveTags(student))
    .map((id) => TAG_BY_ID.get(id))
    .filter(Boolean);
  return tags;
}

function getDeskmateIndex(index) {
  if (index < 0) {
    return -1;
  }
  return index % 2 === 0 ? index + 1 : index - 1;
}

function getActiveComplementRules() {
  const ids = new Set(state.settings?.complementRuleIds || []);
  return COMPLEMENT_RULES.filter((rule) => ids.has(rule.id));
}

function getComplementReason(student, mate, rules = COMPLEMENT_RULES) {
  if (!student || !mate) {
    return "";
  }
  const tagsA = new Set(getEffectiveTags(student));
  const tagsB = new Set(getEffectiveTags(mate));
  const matched = rules.find((rule) => {
    const direct = tagsA.has(rule.leftTagId) && tagsB.has(rule.rightTagId);
    const reverse = tagsA.has(rule.rightTagId) && tagsB.has(rule.leftTagId);
    return direct || reverse;
  });
  return matched ? matched.labelZh.replace(" ↔ ", " + ") : "";
}

function getComplementMatches(student, mate, rules = COMPLEMENT_RULES) {
  if (!student || !mate) {
    return [];
  }
  const tagsA = new Set(getEffectiveTags(student));
  const tagsB = new Set(getEffectiveTags(mate));
  return rules
    .filter((rule) => {
      const direct = tagsA.has(rule.leftTagId) && tagsB.has(rule.rightTagId);
      const reverse = tagsA.has(rule.rightTagId) && tagsB.has(rule.leftTagId);
      return direct || reverse;
    })
    .map((rule) => ({
      ruleId: rule.id,
      ruleLabel: rule.labelZh,
      reason: rule.labelZh.replace(" ↔ ", " + ")
    }));
}

function getSeatReason(student, index, order = state.seatOrder) {
  if (!student) {
    return "";
  }
  const reasons = [];
  const lockedPair = (state.settings.constraints.lockedDeskmatePairs || []).find(
    (pair) => pair.a === student.id || pair.b === student.id
  );
  const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
  if ((state.settings.constraints.frontRowStudentIds || []).includes(student.id) && Math.floor(index / COLS) < frontRows) {
    reasons.push("前排要求");
  }
  if (lockedPair) {
    const mateId = lockedPair.a === student.id ? lockedPair.b : lockedPair.a;
    const mateIndex = order.indexOf(mateId);
    if (areDeskmatesByIndex(index, mateIndex)) {
      reasons.push("锁定同桌");
    }
  }
  const mateId = order[getDeskmateIndex(index)];
  const mate = mateId ? state.students.find((item) => item.id === mateId) : null;
  if (mate) {
    const complementReason = getComplementReason(student, mate, getActiveComplementRules());
    if (complementReason) {
      reasons.push(complementReason);
    } else if (
      state.settings.pairByGender &&
      student.gender &&
      mate.gender &&
      student.gender !== mate.gender
    ) {
      reasons.push("男女同桌");
    }
  }
  return reasons.slice(0, 2).join(" · ");
}

function estimateSeatTagRows(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return 0;
  }
  const usableWidth = 112;
  let rows = 1;
  let currentWidth = 0;
  tags.forEach((tag) => {
    const textLength = Array.from(tag?.labelZh || "").length;
    const chipWidth = Math.max(34, textLength * 10 + 14);
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
  const baseHeight = 148;
  const perRowHeight = 19;
  const extraHeight = maxTagRows > 0 ? maxTagRows * perRowHeight + 2 : 0;
  return baseHeight + extraHeight;
}

function renderSeatGrid() {
  seatGroups.innerHTML = "";
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const lockedSet = new Set(state.lockedSeats);
  const rows = getRowCount();
  document.documentElement.style.setProperty("--seat-height", `${getUniformSeatHeight()}px`);
  document.documentElement.style.setProperty("--seat-cols", COLS.toString());
  document.documentElement.style.setProperty("--seat-pair-groups", Math.ceil(COLS / 2).toString());
  document.documentElement.style.setProperty("--seat-pair-size", "2");
  if (seatEmptyState) {
    seatEmptyState.classList.toggle("hidden", Boolean(rows));
  }

  if (!rows) {
    return;
  }

  for (let group = 0; group < COLS / 2; group += 1) {
    const groupEl = document.createElement("div");
    groupEl.className = "seat-group";
    groupEl.style.gridTemplateRows = `repeat(${rows}, var(--seat-height))`;

    for (let displayRow = 0; displayRow < rows; displayRow += 1) {
      const row = getSeatDataRowFromDisplayRow(displayRow, rows);
      for (let colInGroup = 0; colInGroup < 2; colInGroup += 1) {
        const col = group * 2 + colInGroup + 1;
        const index = row * COLS + (col - 1);
        const studentId = state.seatOrder[index];
        const student = studentId ? studentById.get(studentId) : null;
        const isLocked = lockedSet.has(index);

        const seat = document.createElement("div");
        seat.className = "seat";
        if (student?.gender === "男") {
          seat.classList.add("male");
        } else if (student?.gender === "女") {
          seat.classList.add("female");
        }
        if (isLocked) {
          seat.classList.add("locked");
        }
        if (!student) {
          seat.classList.add("empty");
        } else {
          seat.classList.add("has-student");
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

        const seatChildren = [name, meta];
        if (student && student.gender) {
          const gender = document.createElement("div");
          gender.className = "seat-meta gender";
          gender.textContent = `性别：${student.gender}`;
          seatChildren.push(gender);
        }
        if (tagRow) {
          seatChildren.push(tagRow);
        }
        seat.append(...seatChildren, label, lockBtn);

        if (swapHighlight.has(index)) {
          seat.classList.add("swap-settle");
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
    swapHighlight.clear();
    setTimeout(() => {
      document.querySelectorAll(".seat.swap-settle").forEach((item) => {
        item.classList.remove("swap-settle");
      });
    }, 540);
  }
  playPendingSeatFlip();
}

function getEdgeScrollSpeed(distance, threshold, maxSpeed) {
  if (distance >= threshold) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(threshold, distance));
  const intensity = 1 - clamped / threshold;
  return Math.max(2, Math.round(maxSpeed * intensity));
}

function runDragAutoScroll() {
  if (!dragAutoScrollY && !dragAutoScrollX) {
    dragAutoScrollFrame = null;
    return;
  }
  if (dragAutoScrollY) {
    window.scrollBy({ top: dragAutoScrollY, left: 0, behavior: "auto" });
  }
  if (dragAutoScrollX) {
    const wrap = document.querySelector(".seat-grid-wrap");
    if (wrap) {
      wrap.scrollLeft += dragAutoScrollX;
    }
  }
  dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
}

function startDragAutoScroll() {
  if (dragAutoScrollFrame === null) {
    dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
  }
}

function stopDragAutoScroll() {
  dragAutoScrollY = 0;
  dragAutoScrollX = 0;
  if (dragAutoScrollFrame !== null) {
    cancelAnimationFrame(dragAutoScrollFrame);
    dragAutoScrollFrame = null;
  }
}

function updateDragAutoScroll(clientX, clientY) {
  const verticalThreshold = 96;
  const horizontalThreshold = 76;
  const maxVerticalSpeed = 18;
  const maxHorizontalSpeed = 16;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  if (clientY < verticalThreshold) {
    dragAutoScrollY = -getEdgeScrollSpeed(clientY, verticalThreshold, maxVerticalSpeed);
  } else if (viewportHeight - clientY < verticalThreshold) {
    dragAutoScrollY = getEdgeScrollSpeed(viewportHeight - clientY, verticalThreshold, maxVerticalSpeed);
  } else {
    dragAutoScrollY = 0;
  }

  dragAutoScrollX = 0;
  const wrap = document.querySelector(".seat-grid-wrap");
  if (wrap) {
    const rect = wrap.getBoundingClientRect();
    if (clientX - rect.left < horizontalThreshold) {
      dragAutoScrollX = -getEdgeScrollSpeed(clientX - rect.left, horizontalThreshold, maxHorizontalSpeed);
    } else if (rect.right - clientX < horizontalThreshold) {
      dragAutoScrollX = getEdgeScrollSpeed(rect.right - clientX, horizontalThreshold, maxHorizontalSpeed);
    }
  }

  if (dragAutoScrollY || dragAutoScrollX) {
    startDragAutoScroll();
  } else {
    stopDragAutoScroll();
  }
}

document.addEventListener("dragover", (event) => {
  if (dragSourceIndex === null) {
    return;
  }
  updateDragAutoScroll(event.clientX, event.clientY);
});

document.addEventListener("drop", stopDragAutoScroll);
document.addEventListener("dragend", stopDragAutoScroll);

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
    stopDragAutoScroll();
    seat.classList.remove("dragging");
    document.querySelectorAll(".seat.drag-over").forEach((item) => {
      item.classList.remove("drag-over");
    });
  });

  seat.addEventListener("dragover", (event) => {
    if (dragSourceIndex === null) {
      stopDragAutoScroll();
      return;
    }
    event.preventDefault();
    updateDragAutoScroll(event.clientX, event.clientY);
    seat.classList.add("drag-over");
    event.dataTransfer.dropEffect = "move";
  });

  seat.addEventListener("dragleave", () => {
    seat.classList.remove("drag-over");
  });

  seat.addEventListener("drop", (event) => {
    if (dragSourceIndex === null) {
      stopDragAutoScroll();
      return;
    }
    event.preventDefault();
    stopDragAutoScroll();
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
  queueSeatFlip(sourceIndex, targetIndex);
  const before = cloneSeatSnapshot();
  const next = [...state.seatOrder];
  const sourceValue = next[sourceIndex] || null;
  const targetValue = next[targetIndex] || null;
  next[sourceIndex] = targetValue;
  next[targetIndex] = sourceValue;
  state.seatOrder = next;
  swapHighlight = new Set([sourceIndex, targetIndex]);
  pushSeatUndo("拖拽换座", before);
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
  renderSeatRuleSummary();
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
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const activeComplementRules = getActiveComplementRules();
  const requiredDetails = [];
  const frontDetails = [];
  const genderDetails = {
    mixed: [],
    same: [],
    unknown: []
  };
  const complementDetails = [];
  const normalizedNoDeskPairs = state.settings.constraints.noDeskmatePairs.map((pair) => {
    const a = normalizeName(idToName.get(pair.a));
    const b = normalizeName(idToName.get(pair.b));
    return [a, b].sort().join("|");
  });
  const noDeskSet = new Set(normalizedNoDeskPairs.filter((item) => item !== "|"));

  let softPenalty = 0;
  let complementMatchedCount = 0;
  const complementReasons = [];
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
      issues.push(`${idToName.get(leftId)} 和 ${idToName.get(rightId)} 仍然坐成了同桌`);
    }
    const leftGender = idToGender.get(leftId);
    const rightGender = idToGender.get(rightId);
    const genderItem = {
      leftId,
      rightId,
      leftName: idToName.get(leftId) || "未知",
      rightName: idToName.get(rightId) || "未知",
      leftSeat: getSeatPositionLabel(left),
      rightSeat: getSeatPositionLabel(right),
      leftGender: leftGender || "未知",
      rightGender: rightGender || "未知"
    };
    if (!leftGender || !rightGender) {
      genderDetails.unknown.push(genderItem);
    } else if (leftGender === rightGender) {
      if (state.settings.pairByGender) {
        softPenalty += 1;
      }
      genderDetails.same.push(genderItem);
    } else {
      genderDetails.mixed.push(genderItem);
    }
    if (activeComplementRules.length) {
      const leftStudent = studentById.get(leftId);
      const rightStudent = studentById.get(rightId);
      const matches = getComplementMatches(leftStudent, rightStudent, activeComplementRules);
      if (matches.length) {
        complementMatchedCount += 1;
        const reason = matches.map((match) => match.reason).join("、");
        complementReasons.push(`${idToName.get(leftId)} - ${idToName.get(rightId)}：${reason}`);
        complementDetails.push({
          leftId,
          rightId,
          leftName: idToName.get(leftId) || "未知",
          rightName: idToName.get(rightId) || "未知",
          leftSeat: getSeatPositionLabel(left),
          rightSeat: getSeatPositionLabel(right),
          matches
        });
      }
    }
  });

  state.settings.constraints.lockedDeskmatePairs.forEach((pair) => {
    const leftIndex = order.indexOf(pair.a);
    const rightIndex = order.indexOf(pair.b);
    if (leftIndex === -1 || rightIndex === -1) {
      return;
    }
    const satisfied = areDeskmatesByIndex(leftIndex, rightIndex);
    requiredDetails.push({
      type: "安排同桌",
      label: `${idToName.get(pair.a) || "未知"} 和 ${idToName.get(pair.b) || "未知"} 安排同桌`,
      satisfied,
      studentIds: [pair.a, pair.b],
      seats: [getSeatPositionLabel(leftIndex), getSeatPositionLabel(rightIndex)]
    });
    if (!areDeskmatesByIndex(leftIndex, rightIndex)) {
      issues.push(`${idToName.get(pair.a) || "未知"} 和 ${idToName.get(pair.b) || "未知"} 没有安排成同桌`);
    }
  });

  const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
  state.settings.constraints.frontRowStudentIds.forEach((studentId) => {
    const seatIndex = order.indexOf(studentId);
    if (seatIndex === -1) {
      return;
    }
    const currentRow = Math.floor(seatIndex / COLS) + 1;
    const satisfied = Math.floor(seatIndex / COLS) < frontRows;
    const detail = {
      type: "前排照顾",
      label: `${idToName.get(studentId) || "未知学生"} 坐前 ${frontRows} 排`,
      satisfied,
      studentIds: [studentId],
      seats: [getSeatPositionLabel(seatIndex)],
      currentRow,
      frontRows
    };
    requiredDetails.push(detail);
    frontDetails.push(detail);
    if (!satisfied) {
      issues.push(`${idToName.get(studentId) || "未知学生"} 没有坐在前 ${frontRows} 排`);
    }
  });

  state.settings.constraints.noDeskmatePairs.forEach((pair) => {
    const leftIndex = order.indexOf(pair.a);
    const rightIndex = order.indexOf(pair.b);
    if (leftIndex === -1 || rightIndex === -1) {
      return;
    }
    const satisfied = !areDeskmatesByIndex(leftIndex, rightIndex);
    requiredDetails.push({
      type: "避免同桌",
      label: `${idToName.get(pair.a) || "未知"} 不和 ${idToName.get(pair.b) || "未知"} 同桌`,
      satisfied,
      studentIds: [pair.a, pair.b],
      seats: [getSeatPositionLabel(leftIndex), getSeatPositionLabel(rightIndex)]
    });
  });

  return {
    hardViolations: issues.length,
    softPenalty,
    complementMatchedCount,
    complementEnabled: activeComplementRules.length > 0,
    complementReasons,
    details: {
      required: requiredDetails,
      gender: genderDetails,
      complement: complementDetails,
      front: frontDetails
    },
    issues
  };
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

function buildBestShuffleCandidate() {
  const retries = Math.max(50, Number.parseInt(state.settings.constraints.maxRetries, 10) || 200);
  const complementEnabled = getActiveComplementRules().length > 0;
  let bestOrder = null;
  let bestEval = null;

  for (let i = 0; i < retries; i += 1) {
    const candidate = generateCandidateOrderFromCurrent();
    const result = evaluateShuffleOrder(candidate);
    if (
      !bestEval ||
      result.hardViolations < bestEval.hardViolations ||
      (result.hardViolations === bestEval.hardViolations && result.softPenalty < bestEval.softPenalty) ||
      (result.hardViolations === bestEval.hardViolations &&
        result.softPenalty === bestEval.softPenalty &&
        result.complementMatchedCount > (bestEval.complementMatchedCount || 0))
    ) {
      bestOrder = candidate;
      bestEval = result;
    }
    if (!complementEnabled && result.hardViolations === 0 && result.softPenalty === 0) {
      break;
    }
  }
  return bestOrder ? { order: bestOrder, eval: bestEval } : null;
}

function getSeatPreviewStats(order, evaluation) {
  const changedCount = getChangedSeatIndices(state.seatOrder, order).length;
  const deskPairs = getDeskPairsForSeatCount(order.length);
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
  let occupiedPairs = 0;
  let mixedGenderPairs = 0;
  deskPairs.forEach(([left, right]) => {
    const leftStudent = studentById.get(order[left]);
    const rightStudent = studentById.get(order[right]);
    if (!leftStudent || !rightStudent) {
      return;
    }
    occupiedPairs += 1;
    if (leftStudent.gender && rightStudent.gender && leftStudent.gender !== rightStudent.gender) {
      mixedGenderPairs += 1;
    }
  });
  const frontIds = state.settings.constraints.frontRowStudentIds || [];
  const frontSatisfied = frontIds.filter((id) => {
    const index = order.indexOf(id);
    return index !== -1 && Math.floor(index / COLS) < frontRows;
  }).length;
  const requiredTotal =
    (state.settings.constraints.lockedDeskmatePairs || []).length +
    (state.settings.constraints.noDeskmatePairs || []).length +
    frontIds.length;
  const unmetRequired = evaluation?.hardViolations || 0;
  return {
    changedCount,
    occupiedPairs,
    mixedGenderPairs,
    sameGenderPairs: evaluation?.details?.gender?.same?.length || 0,
    unknownGenderPairs: evaluation?.details?.gender?.unknown?.length || 0,
    complementEnabled: Boolean(evaluation?.complementEnabled),
    complementMatchedCount: evaluation?.complementMatchedCount || 0,
    frontSatisfied,
    frontTotal: frontIds.length,
    requiredTotal,
    requiredSatisfied: Math.max(0, requiredTotal - unmetRequired),
    hardViolations: unmetRequired,
    softPenalty: evaluation?.softPenalty || 0
  };
}

function createPreviewDetailItem(text, status = "") {
  const item = document.createElement("div");
  item.className = `preview-detail-item ${status}`.trim();
  item.textContent = text;
  return item;
}

function renderPreviewDetailList(container, title, items, emptyText) {
  const block = document.createElement("div");
  block.className = "preview-detail-block";
  const heading = document.createElement("div");
  heading.className = "preview-block-title";
  heading.textContent = title;
  block.appendChild(heading);
  if (items.length) {
    items.forEach((item) => block.appendChild(item));
  } else {
    block.appendChild(createPreviewDetailItem(emptyText, "muted"));
  }
  container.appendChild(block);
}

function getChangedSeatDetails(order) {
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  return getChangedSeatIndices(state.seatOrder, order).map((index) => {
    const beforeId = state.seatOrder[index];
    const afterId = order[index];
    const beforeName = beforeId ? studentById.get(beforeId)?.name || "未知" : "空";
    const afterName = afterId ? studentById.get(afterId)?.name || "未知" : "空";
    return createPreviewDetailItem(`${getSeatPositionLabel(index)}：${beforeName} → ${afterName}`);
  });
}

function renderShufflePreviewDetails(result, stats) {
  if (!shufflePreviewDetails || !result?.order) {
    return;
  }
  shufflePreviewDetails.innerHTML = "";
  const details = result.eval?.details || {};
  if (activeShufflePreviewDetail === "changed") {
    renderPreviewDetailList(
      shufflePreviewDetails,
      "发生变化的座位",
      getChangedSeatDetails(result.order),
      "本次方案和当前座位完全一致。"
    );
    return;
  }

  if (activeShufflePreviewDetail === "required") {
    const required = details.required || [];
    const satisfied = required
      .filter((item) => item.satisfied)
      .map((item) => createPreviewDetailItem(`${item.label}（${item.seats.join("、")}）`, "ok"));
    const unmet = required
      .filter((item) => !item.satisfied)
      .map((item) => createPreviewDetailItem(`${item.label}（当前：${item.seats.join("、")}）`, "warn"));
    renderPreviewDetailList(shufflePreviewDetails, "已满足的明确要求", satisfied, "暂无明确要求。");
    renderPreviewDetailList(
      shufflePreviewDetails,
      "未满足的明确要求",
      unmet,
      stats.requiredTotal ? "明确要求都已满足。" : "暂无明确要求。"
    );
    if (stats.hardViolations) {
      shufflePreviewDetails.appendChild(createPreviewDetailItem("建议再随机一次，或拖动调整到满意后采用。", "warn"));
    }
    return;
  }

  if (activeShufflePreviewDetail === "gender") {
    const mixed = (details.gender?.mixed || []).map((item) =>
      createPreviewDetailItem(`${item.leftName} - ${item.rightName}：${item.leftGender} + ${item.rightGender}`, "ok")
    );
    const same = (details.gender?.same || []).map((item) =>
      createPreviewDetailItem(`${item.leftName} - ${item.rightName}：${item.leftGender} + ${item.rightGender}`, "warn")
    );
    const unknown = (details.gender?.unknown || []).map((item) =>
      createPreviewDetailItem(`${item.leftName} - ${item.rightName}：性别未完整填写`, "muted")
    );
    renderPreviewDetailList(shufflePreviewDetails, "男女同桌", mixed, "暂未形成男女同桌。");
    renderPreviewDetailList(
      shufflePreviewDetails,
      state.settings.pairByGender ? "还没做到的同桌" : "同性别同桌",
      same,
      "没有同性别同桌。"
    );
    renderPreviewDetailList(shufflePreviewDetails, "无法判断的同桌", unknown, "没有性别未知的同桌。");
    return;
  }

  if (activeShufflePreviewDetail === "complement") {
    if (!stats.complementEnabled) {
      renderPreviewDetailList(
        shufflePreviewDetails,
        "互补关系",
        [],
        "未勾选互补关系；如需强弱/性格互补，请在排座要求中勾选。"
      );
      return;
    }
    const byRule = new Map();
    (details.complement || []).forEach((item) => {
      item.matches.forEach((match) => {
        if (!byRule.has(match.ruleLabel)) {
          byRule.set(match.ruleLabel, []);
        }
        byRule.get(match.ruleLabel).push(
          createPreviewDetailItem(`${item.leftName} - ${item.rightName}（${item.leftSeat}、${item.rightSeat}）：${match.reason}`, "ok")
        );
      });
    });
    if (!byRule.size) {
      renderPreviewDetailList(shufflePreviewDetails, "已形成的互补同桌", [], "本次没有形成明显互补同桌。");
      return;
    }
    byRule.forEach((items, ruleLabel) => {
      renderPreviewDetailList(shufflePreviewDetails, ruleLabel, items, "暂无。");
    });
    return;
  }

  if (activeShufflePreviewDetail === "front") {
    const front = details.front || [];
    const satisfied = front
      .filter((item) => item.satisfied)
      .map((item) => createPreviewDetailItem(`${item.label}：当前 ${item.seats[0]}`, "ok"));
    const unmet = front
      .filter((item) => !item.satisfied)
      .map((item) => createPreviewDetailItem(`${item.label}：当前第 ${item.currentRow} 行`, "warn"));
    renderPreviewDetailList(shufflePreviewDetails, "已坐到前排", satisfied, "暂无前排照顾学生。");
    renderPreviewDetailList(shufflePreviewDetails, "还未坐到前排", unmet, "前排照顾都已满足。");
  }
}

function renderPreviewSeatGrid(order) {
  if (!shufflePreviewSeatGrid) {
    return;
  }
  const rows = getRowCountFromSeatCount(order.length);
  const studentById = new Map(state.students.map((student) => [student.id, student]));
  shufflePreviewSeatGrid.innerHTML = "";
  shufflePreviewSeatGrid.style.setProperty("--preview-seat-rows", rows.toString());

  const rowLabelsEl = document.createElement("div");
  rowLabelsEl.className = "row-labels preview-row-labels";
  rowLabelsEl.style.gridTemplateRows = rows ? `repeat(${rows}, var(--preview-seat-height))` : "none";
  for (let displayRow = 0; displayRow < rows; displayRow += 1) {
    const label = document.createElement("div");
    label.textContent = `第 ${rows - displayRow} 行`;
    rowLabelsEl.appendChild(label);
  }

  const groupsEl = document.createElement("div");
  groupsEl.className = "seat-groups preview-seat-groups";
  for (let group = 0; group < COLS / 2; group += 1) {
    const groupEl = document.createElement("div");
    groupEl.className = "seat-group";
    groupEl.style.gridTemplateRows = `repeat(${rows}, var(--preview-seat-height))`;
    for (let displayRow = 0; displayRow < rows; displayRow += 1) {
      const row = getSeatDataRowFromDisplayRow(displayRow, rows);
      for (let colInGroup = 0; colInGroup < 2; colInGroup += 1) {
        const col = group * 2 + colInGroup + 1;
        const index = row * COLS + (col - 1);
        const studentId = order[index];
        const student = studentId ? studentById.get(studentId) : null;
        const seat = document.createElement("div");
        seat.className = "seat preview-seat";
        if (student?.gender === "男") {
          seat.classList.add("male");
        } else if (student?.gender === "女") {
          seat.classList.add("female");
        }
        if (!student) {
          seat.classList.add("empty");
        }
        seat.dataset.index = index.toString();
        seat.draggable = true;

        const name = document.createElement("div");
        name.className = "seat-name";
        name.textContent = student ? student.name : "空";
        if (student && Array.from(student.name || "").length >= 4) {
          name.classList.add("long");
        }
        if (student && Array.from(student.name || "").length >= 5) {
          name.classList.add("extra-long");
        }
        const label = document.createElement("div");
        label.className = "seat-label";
        label.textContent = `${row + 1}-${col}`;
        seat.append(name, label);
        if (student) {
          seat.addEventListener("click", () => {
            if (!previewSuppressNextClick) {
              openRecordModal(student.id);
            }
          });
        }
        attachPreviewSeatDragHandlers(seat, index);
        groupEl.appendChild(seat);
      }
    }
    groupsEl.appendChild(groupEl);
  }
  shufflePreviewSeatGrid.append(rowLabelsEl, groupsEl);
}

function attachPreviewSeatDragHandlers(seat, index) {
  seat.addEventListener("dragstart", (event) => {
    previewDragSourceIndex = index;
    previewSuppressNextClick = true;
    seat.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", index.toString());
  });
  seat.addEventListener("dragend", () => {
    previewDragSourceIndex = null;
    seat.classList.remove("dragging");
    document.querySelectorAll(".preview-seat.drag-over").forEach((item) => item.classList.remove("drag-over"));
    setTimeout(() => {
      previewSuppressNextClick = false;
    }, 0);
  });
  seat.addEventListener("dragover", (event) => {
    if (previewDragSourceIndex === null) {
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
    if (previewDragSourceIndex === null) {
      return;
    }
    event.preventDefault();
    seat.classList.remove("drag-over");
    const source = Number.parseInt(event.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(source)) {
      swapPreviewSeats(source, index);
    }
  });
}

function swapPreviewSeats(sourceIndex, targetIndex) {
  if (!pendingShufflePreview?.order || sourceIndex === targetIndex) {
    return;
  }
  const nextOrder = [...pendingShufflePreview.order];
  const sourceValue = nextOrder[sourceIndex] || null;
  nextOrder[sourceIndex] = nextOrder[targetIndex] || null;
  nextOrder[targetIndex] = sourceValue;
  pendingShufflePreview.order = nextOrder;
  pendingShufflePreview.eval = evaluateShuffleOrder(nextOrder);
  refreshPendingShufflePreview();
}

function refreshPendingShufflePreview() {
  if (!pendingShufflePreview?.order) {
    return;
  }
  renderShufflePreview({
    order: pendingShufflePreview.order,
    eval: pendingShufflePreview.eval
  });
}

function renderShufflePreview(result) {
  if (!shufflePreviewModal || !result?.order) {
    return;
  }
  const stats = getSeatPreviewStats(result.order, result.eval);
  shufflePreviewSummary.innerHTML = "";
  const cards = [
    ["changed", "变动座位", `${stats.changedCount} 个`],
    ["required", "明确要求", stats.requiredTotal ? `${stats.requiredSatisfied}/${stats.requiredTotal} 条已满足` : "未设置"],
    ["gender", "尽量男女同桌", `${stats.mixedGenderPairs}/${stats.occupiedPairs} 对`],
    ["complement", "互补关系", stats.complementEnabled ? `互补同桌 ${stats.complementMatchedCount} 对` : "未启用"],
    ["front", "前排要求", stats.frontTotal ? `${stats.frontSatisfied}/${stats.frontTotal} 人` : "无"]
  ];
  cards.forEach(([key, label, value]) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `preview-stat ${activeShufflePreviewDetail === key ? "active" : ""}`;
    card.dataset.detail = key;
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    card.addEventListener("click", () => {
      activeShufflePreviewDetail = key;
      renderShufflePreviewDetails(result, stats);
      shufflePreviewSummary.querySelectorAll(".preview-stat").forEach((item) => {
        item.classList.toggle("active", item.dataset.detail === key);
      });
    });
    shufflePreviewSummary.appendChild(card);
  });
  renderPreviewSeatGrid(result.order);
  renderShufflePreviewDetails(result, stats);
}

function openShufflePreview(result) {
  if (!shufflePreviewModal || !result?.order) {
    return;
  }
  activeShufflePreviewDetail = "required";
  pendingShufflePreview = {
    order: [...result.order],
    eval: result.eval
  };
  renderShufflePreview(result);
  shufflePreviewModal.classList.remove("hidden");
  shufflePreviewModal.setAttribute("aria-hidden", "false");
}

function closeShufflePreview() {
  if (!shufflePreviewModal) {
    return;
  }
  shufflePreviewModal.classList.add("hidden");
  shufflePreviewModal.setAttribute("aria-hidden", "true");
  pendingShufflePreview = null;
  previewDragSourceIndex = null;
  previewSuppressNextClick = false;
}

function shuffleSeats() {
  const result = buildBestShuffleCandidate();
  if (!result) {
    showToast("暂时无法生成排座方案", "error");
    return;
  }
  openShufflePreview(result);
}

function applyShufflePreview() {
  if (!pendingShufflePreview?.order) {
    closeShufflePreview();
    return;
  }
  const before = cloneSeatSnapshot();
  const nextOrder = [...pendingShufflePreview.order];
  const evaluation = pendingShufflePreview.eval;
  state.seatOrder = nextOrder;
  queueSeatFlash(getChangedSeatIndices(before.seatOrder, state.seatOrder));
  pushSeatUndo("随机排座", before);
  saveState();
  renderAll();
  closeShufflePreview();
  if (evaluation && evaluation.hardViolations > 0) {
    showToast("已采用最接近方案（部分明确要求未满足）", "info");
  } else {
    showToast("随机排座已采用", "success");
  }
}

function resetSeats() {
  const before = cloneSeatSnapshot();
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
  queueSeatFlash(getChangedSeatIndices(before.seatOrder, state.seatOrder));
  pushSeatUndo("按名单顺序", before);
  saveState();
  renderAll();
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
  renderDrawResults();
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
  if (drawHistoryDetails && !drawHistoryDetails.open) {
    drawHistoryDetails.querySelector("summary")?.click();
  }
  showToast("抽签完成", "success");
}

function renderDrawResults() {
  const isNoRepeat = Boolean(state.draw.noRepeat);
  if (drawHistorySummary) {
    const count = state.draw.history.length;
    drawHistorySummary.textContent = count ? `抽签结果与历史 ${count}` : "抽签结果与历史";
  }

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
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无抽签记录。";
    drawResults.appendChild(empty);
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
  const before = cloneSeatSnapshot();
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
  queueSeatFlash(getChangedSeatIndices(before.seatOrder, state.seatOrder));
  pushSeatUndo("恢复历史座位", before);
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

  for (let displayRow = 0; displayRow < rows; displayRow += 1) {
    const row = getSeatDataRowFromDisplayRow(displayRow, rows) + 1;
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

function cloneJson(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

function makeStudentFromImport(name, gender, preservedStudent = null) {
  return {
    id: preservedStudent?.id || uid(),
    name,
    gender: gender || preservedStudent?.gender || "",
    aliases: preservedStudent ? cloneJson(preservedStudent.aliases, []) : [],
    records: preservedStudent ? cloneJson(preservedStudent.records, []) : [],
    manualTags: preservedStudent ? cloneJson(preservedStudent.manualTags, []) : [],
    autoTags: preservedStudent ? cloneJson(preservedStudent.autoTags, []) : [],
    exams: preservedStudent ? cloneJson(preservedStudent.exams, []) : []
  };
}

function buildPreservedStudentLookup() {
  const lookup = new Map();
  state.students.forEach((student) => {
    const keys = [student.name, ...(student.aliases || [])].map((value) => normalizeName(value)).filter(Boolean);
    keys.forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, []);
      }
      lookup.get(key).push(student);
    });
  });
  return lookup;
}

function takePreservedStudent(lookup, name) {
  const key = normalizeName(name);
  if (!key || !lookup.has(key)) {
    return null;
  }
  const list = lookup.get(key);
  return list.shift() || null;
}

function applyImportData(data, replaceExisting, keepHistory = true) {
  const { names, placements, genders, genderList, hasPlacement } = data;
  const incomingNames = [...names];

  normalizeSeatOrder();

  if (!incomingNames.length && !hasPlacement) {
    importStatus.textContent = "没有识别到学生姓名，请检查文件格式。";
    return false;
  }

  if (replaceExisting) {
    const preservedLookup = keepHistory ? buildPreservedStudentLookup() : new Map();
    const preservedDraw = keepHistory ? cloneJson(state.draw, { noRepeat: false, used: [], history: [] }) : null;
    const preservedSeatHistory = keepHistory ? cloneJson(state.seatHistory, []) : [];
    const preservedExams = keepHistory ? cloneJson(state.exams, []) : [];
    const preservedSavedExams = keepHistory ? cloneJson(state.savedExams, []) : [];
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
      const student = makeStudentFromImport(name, gender, takePreservedStudent(preservedLookup, name));
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
      const student = makeStudentFromImport(name, gender, takePreservedStudent(preservedLookup, name));
      students.push(student);
      const emptyIndex = seatOrder.indexOf(null);
      if (emptyIndex !== -1) {
        seatOrder[emptyIndex] = student.id;
      }
    });

    state.students = students;
    state.seatOrder = seatOrder;
    if (keepHistory) {
      const idSet = new Set(students.map((student) => student.id));
      state.draw = preservedDraw;
      state.draw.used = (state.draw.used || []).filter((id) => idSet.has(id));
      state.seatHistory = preservedSeatHistory;
      state.exams = preservedExams;
      state.savedExams = preservedSavedExams;
    } else {
      state.draw.used = [];
      state.draw.history = [];
      state.seatHistory = [];
      state.exams = [];
      state.savedExams = [];
    }
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
  const replaceExisting = Boolean(importReplace?.checked);
  const keepHistory = replaceExisting ? Boolean(importKeepHistory?.checked) : true;

  if (isCsv) {
    file
      .text()
      .then((text) => {
        const rows = parseCSV(text);
        const data = parseSpreadsheetRows(rows);
        if (applyImportData(data, replaceExisting, keepHistory)) {
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
        if (applyImportData(data, replaceExisting, keepHistory)) {
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

function downloadJsonFile(filename, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
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
  for (let displayRow = 0; displayRow < rows; displayRow += 1) {
    const row = getSeatDataRowFromDisplayRow(displayRow, rows);
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
  downloadJsonFile(filename, content);
  state.lastBackupAt = exportedAt;
  saveState();
  renderBackupInfo();
  showToast("备份已导出", "success");
}

function exportPreImportBackup() {
  const exportedAt = new Date().toISOString();
  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
    reason: "before-import",
    data: state
  };
  const filename = `before_import_backup_${formatDateForFilename()}_${new Date()
    .toTimeString()
    .slice(0, 5)
    .replace(":", "")}.json`;
  downloadJsonFile(filename, JSON.stringify(payload, null, 2));
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
      exportPreImportBackup();
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

function normalizeAiMappingResult(result, headers) {
  const safeIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < headers.length ? parsed : -1;
  };
  const subjectMappings = Array.isArray(result?.subjectMappings)
    ? result.subjectMappings
        .map((item) => ({
          subject: SUBJECT_ORDER.includes(item?.subject) ? item.subject : "",
          scoreCol: safeIndex(item?.scoreCol),
          rankClassCol: safeIndex(item?.rankClassCol),
          rankSchoolCol: safeIndex(item?.rankSchoolCol)
        }))
        .filter((item) => item.subject && item.scoreCol !== -1)
    : [];
  return {
    reliable: false,
    reason: "ai",
    headers,
    nameCol: safeIndex(result?.nameCol),
    subjectMappings,
    totalMapping: {
      scoreCol: safeIndex(result?.totalMapping?.scoreCol),
      rankClassCol: safeIndex(result?.totalMapping?.rankClassCol),
      rankSchoolCol: safeIndex(result?.totalMapping?.rankSchoolCol)
    },
    conflicts: result?.note ? [`AI 已辅助识别：${String(result.note).slice(0, 80)}`] : ["AI 已辅助识别列，请确认后再保存。"],
    candidatesBySubject: {}
  };
}

function buildScoreMappingAiPayload(rows, filename, localMapping) {
  const headers = Array.isArray(localMapping?.headers) ? localMapping.headers : rows[0] || [];
  return {
    filename: filename || "",
    headers: headers.map((header, index) => ({ index, header: header || `第${index + 1}列` })),
    sampleRows: rows.slice(1, 9).map((row) => headers.map((_, index) => String(row[index] ?? "").slice(0, 40))),
    knownSubjects: SUBJECT_ORDER,
    localSuggestion: {
      nameCol: localMapping?.nameCol ?? -1,
      subjectMappings: localMapping?.subjectMappings || [],
      totalMapping: localMapping?.totalMapping || { scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 },
      conflicts: localMapping?.conflicts || []
    }
  };
}

async function requestAiScoreMapping(rows, filename, localMapping) {
  if (window.location.protocol === "file:" || !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }
  const payload = buildScoreMappingAiPayload(rows, filename, localMapping);
  if (!validateAiPayloadSize(payload)) {
    return { ok: false, reason: "too_large" };
  }
  const auth = await ensureAiAuth();
  if (!auth) {
    return { ok: false, reason: "no_auth" };
  }
  const baseUrl = getAiWorkerBaseUrl();
  const response = await fetch(`${baseUrl}/suggest-score-mapping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 401) {
    clearAiAuth(false);
    return { ok: false, reason: "expired" };
  }
  if (response.status === 404) {
    return { ok: false, reason: "not_deployed" };
  }
  if (!response.ok) {
    return { ok: false, reason: "failed" };
  }
  const data = await response.json();
  return { ok: true, mapping: normalizeAiMappingResult(data, localMapping.headers || []) };
}

function getStudentExamsForAutoTag(student, settings) {
  const exams = Array.isArray(student.exams)
    ? student.exams.filter((exam) => exam?.source !== "savedExamRecord")
    : [];
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

function normalizeSavedExamRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const subjects = Array.isArray(record.subjects) ? record.subjects.filter(Boolean).map(String) : [];
  const entries = Array.isArray(record.entries)
    ? record.entries
        .map((entry) => ({
          name: (entry?.name || "").toString().trim(),
          scores: entry?.scores && typeof entry.scores === "object" ? entry.scores : {},
          total: entry?.total && typeof entry.total === "object" ? entry.total : { score: null, rankClass: null, rankSchool: null }
        }))
        .filter((entry) => entry.name)
    : [];
  return {
    id: record.id || uid(),
    name: (record.name || "考试").toString(),
    date: record.date || "",
    savedAt: record.savedAt || new Date().toISOString(),
    studentCount: Number.isInteger(record.studentCount) ? record.studentCount : entries.length,
    subjectCount: Number.isInteger(record.subjectCount) ? record.subjectCount : subjects.length,
    subjects,
    entries
  };
}

function getSavedExamRecords() {
  state.savedExams = Array.isArray(state.savedExams) ? state.savedExams.map(normalizeSavedExamRecord).filter(Boolean) : [];
  return state.savedExams;
}

function getExamContentSignature(exam) {
  if (!exam) {
    return "";
  }
  const subjects = Array.isArray(exam.subjects) ? [...exam.subjects].sort() : [];
  const scores = subjects.map((subject) => {
    const data = exam.scores?.[subject] || {};
    return [
      subject,
      parseScoreValue(data),
      parseRankValue(data?.rankClass),
      parseRankValue(data?.rankSchool)
    ].join(":");
  });
  const total = exam.total || {};
  return JSON.stringify({
    subjects,
    scores,
    total: [parseScoreValue(total.score), parseRankValue(total.rankClass), parseRankValue(total.rankSchool)]
  });
}

function syncSavedExamsToStudentDetails() {
  const records = getSavedExamRecords();
  state.students.forEach((student) => {
    student.exams = Array.isArray(student.exams)
      ? student.exams.filter((exam) => exam?.source !== "savedExamRecord")
      : [];
  });
  if (!records.length || !state.students.length) {
    return;
  }

  records.forEach((record) => {
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

    record.entries.forEach((entry) => {
      const key = normalizeName(entry.name);
      const candidates = nameMap.get(key) || [];
      const student = candidates.shift();
      if (!student) {
        return;
      }
      const syncedExam = {
        id: record.id,
        name: record.name || "考试",
        date: record.date || "",
        subjects: record.subjects || [],
        scores: entry.scores || {},
        total: entry.total || { score: null, rankClass: null, rankSchool: null },
        source: "savedExamRecord"
      };
      const syncedSignature = getExamContentSignature(syncedExam);
      student.exams = student.exams.filter((exam) => {
        if (exam?.id === record.id) {
          return false;
        }
        if ((exam?.name || "") === syncedExam.name && (exam?.date || "") === syncedExam.date) {
          return false;
        }
        return getExamContentSignature(exam) !== syncedSignature;
      });
      student.exams.push(syncedExam);
    });
  });
}

function makeSavedExamRecordFromDraft() {
  const name = scoreExamName.value.trim();
  if (!name) {
    scoreStatus.textContent = "请填写考试名称。";
    scoreExamName.focus();
    return null;
  }
  if (!examDraft) {
    scoreStatus.textContent = "请先上传并解析成绩表";
    return null;
  }
  const date = scoreExamDate.value || new Date().toISOString().slice(0, 10);
  const subjects = Array.isArray(examDraft.subjects) ? [...examDraft.subjects] : [];
  const entries = (Array.isArray(examDraft.entries) ? examDraft.entries : []).map((entry) => ({
    name: entry.name || "",
    scores: entry.scores ? JSON.parse(JSON.stringify(entry.scores)) : {},
    total: entry.total ? JSON.parse(JSON.stringify(entry.total)) : { score: null, rankClass: null, rankSchool: null }
  }));
  return {
    id: uid(),
    name,
    date,
    savedAt: new Date().toISOString(),
    studentCount: entries.length,
    subjectCount: subjects.length,
    subjects,
    entries
  };
}

function saveExamRecord() {
  const record = makeSavedExamRecordFromDraft();
  if (!record) {
    return;
  }
  state.savedExams = getSavedExamRecords();
  state.savedExams.unshift(record);
  syncSavedExamsToStudentDetails();
  expandedSavedExamIds.add(record.id);
  saveState();
  renderExamManager();
  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamList(student);
    }
  }
  scoreStatus.textContent = `已保存「${record.name}」考试记录，共 ${record.studentCount} 名学生、${record.subjectCount} 个科目。`;
  saveScoreBtn.disabled = true;
  examDraft = null;
  showToast("考试记录已保存", "success");
}

function renderExamManager() {
  renderSavedExamList();
  renderLegacyExamManager();
}

function renderSavedExamList() {
  if (!savedExamList) {
    return;
  }
  savedExamList.innerHTML = "";
  const exams = getSavedExamRecords().sort((a, b) => {
    const dateCompare = (b.date || "").localeCompare(a.date || "");
    return dateCompare || (b.savedAt || "").localeCompare(a.savedAt || "");
  });
  if (!exams.length) {
    const empty = document.createElement("div");
    empty.className = "saved-exam-empty muted";
    empty.textContent = "暂无已保存考试。";
    savedExamList.appendChild(empty);
    return;
  }

  exams.forEach((exam) => {
    const item = document.createElement("div");
    item.className = "saved-exam-item";
    const isExpanded = expandedSavedExamIds.has(exam.id);
    if (isExpanded) {
      item.classList.add("expanded");
    }

    const row = document.createElement("button");
    row.type = "button";
    row.className = "saved-exam-row";
    row.dataset.examId = exam.id;
    row.setAttribute("aria-expanded", isExpanded ? "true" : "false");

    const main = document.createElement("div");
    main.className = "saved-exam-main";
    const title = document.createElement("div");
    title.className = "saved-exam-name";
    title.textContent = exam.name || "考试";
    const date = document.createElement("div");
    date.className = "saved-exam-date";
    date.textContent = exam.date || "未填写日期";
    main.append(title, date);

    const meta = document.createElement("div");
    meta.className = "saved-exam-meta";
    meta.textContent = `${exam.studentCount || 0} 人 · ${exam.subjectCount || 0} 科`;

    const arrow = document.createElement("span");
    arrow.className = "saved-exam-arrow";
    arrow.textContent = "⌄";
    row.append(main, meta, arrow);
    item.appendChild(row);

    if (isExpanded) {
      const detail = document.createElement("div");
      detail.className = "saved-exam-detail";
      const nameLine = document.createElement("label");
      nameLine.className = "saved-exam-detail-line saved-exam-edit-line";
      const nameLabel = document.createElement("span");
      nameLabel.textContent = "考试名称";
      const nameInput = document.createElement("input");
      nameInput.className = "input";
      nameInput.type = "text";
      nameInput.maxLength = 30;
      nameInput.value = exam.name || "考试";
      nameInput.dataset.examField = "name";
      nameInput.dataset.examId = exam.id;
      nameLine.append(nameLabel, nameInput);
      detail.appendChild(nameLine);

      const dateLine = document.createElement("label");
      dateLine.className = "saved-exam-detail-line saved-exam-edit-line";
      const dateLabel = document.createElement("span");
      dateLabel.textContent = "考试日期";
      const dateInput = document.createElement("input");
      dateInput.className = "input";
      dateInput.type = "date";
      dateInput.value = exam.date || "";
      dateInput.dataset.examField = "date";
      dateInput.dataset.examId = exam.id;
      dateLine.append(dateLabel, dateInput);
      detail.appendChild(dateLine);

      [
        ["保存时间", formatDateTimeLocal(exam.savedAt)],
        ["学生数量", `${exam.studentCount || 0} 人`],
        ["科目数量", `${exam.subjectCount || 0} 科`]
      ].forEach(([label, value]) => {
        const line = document.createElement("div");
        line.className = "saved-exam-detail-line";
        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        const valueEl = document.createElement("strong");
        valueEl.textContent = value;
        line.append(labelEl, valueEl);
        detail.appendChild(line);
      });

      const actions = document.createElement("div");
      actions.className = "saved-exam-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-secondary";
      saveBtn.dataset.action = "save-saved-exam";
      saveBtn.dataset.examId = exam.id;
      saveBtn.textContent = "保存修改";
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn-secondary";
      viewBtn.dataset.action = "view-saved-exam";
      viewBtn.dataset.examId = exam.id;
      viewBtn.textContent = "查看表格";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-danger-soft";
      deleteBtn.dataset.action = "delete-saved-exam";
      deleteBtn.dataset.examId = exam.id;
      deleteBtn.textContent = "删除考试";
      actions.append(saveBtn, viewBtn, deleteBtn);
      detail.appendChild(actions);
      item.appendChild(detail);
    }

    savedExamList.appendChild(item);
  });
}

function openSavedExamTable(examId) {
  const exam = getSavedExamRecords().find((item) => item.id === examId);
  if (!exam || !savedExamTableModal || !savedExamTableWrap) {
    return;
  }
  activeSavedExamTableId = exam.id;
  savedExamTableTitle.textContent = exam.name || "完整成绩表";
  savedExamTableMeta.textContent = `${exam.date || "未填写日期"} · 保存于 ${formatDateTimeLocal(exam.savedAt)} · ${exam.studentCount || 0} 人 · ${exam.subjectCount || 0} 科`;
  savedExamTableWrap.innerHTML = "";
  if (savedExamSearchInput) {
    savedExamSearchInput.value = "";
  }
  if (savedExamSearchResults) {
    savedExamSearchResults.innerHTML = "";
  }
  if (savedExamSearchStatus) {
    savedExamSearchStatus.textContent = "可输入姓名、拼音、首字母或部分姓名，先选择候选学生再定位。";
  }

  const table = document.createElement("table");
  table.className = "saved-exam-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const columns = [{ label: "学生姓名", type: "name" }];
  exam.subjects.forEach((subject) => {
    columns.push({ label: subject, type: "score", subject });
    columns.push({ label: `${subject}班排`, type: "rank", subject, field: "rankClass" });
    columns.push({ label: `${subject}校排`, type: "rank", subject, field: "rankSchool" });
  });
  const hasTotalScore = exam.entries.some((entry) => Number.isFinite(parseScoreValue(entry.total?.score)));
  const hasTotalClassRank = exam.entries.some((entry) => Number.isInteger(parseRankValue(entry.total?.rankClass)));
  const hasTotalSchoolRank = exam.entries.some((entry) => Number.isInteger(parseRankValue(entry.total?.rankSchool)));
  if (hasTotalScore) {
    columns.push({ label: "总分", type: "score", totalField: "score" });
  }
  if (hasTotalClassRank) {
    columns.push({ label: "总班排", type: "rank", totalField: "rankClass" });
  }
  if (hasTotalSchoolRank) {
    columns.push({ label: "总校排", type: "rank", totalField: "rankSchool" });
  }
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    if (column.type === "score") {
      th.classList.add("score-cell");
    }
    if (column.type === "rank") {
      th.classList.add("rank-cell");
    }
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  exam.entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.dataset.studentName = entry.name || "";
    row.dataset.normalizedName = normalizeName(entry.name);
    row.dataset.searchKeys = getSavedExamSearchKeys(entry.name).join("|");
    row.dataset.rowIndex = String(index + 1);
    const nameCell = document.createElement("td");
    nameCell.textContent = entry.name || "";
    row.appendChild(nameCell);
    exam.subjects.forEach((subject) => {
      const cell = document.createElement("td");
      cell.className = "score-cell";
      const score = parseScoreValue(entry.scores?.[subject]);
      cell.textContent = Number.isFinite(score) ? String(score) : "";
      row.appendChild(cell);
      ["rankClass", "rankSchool"].forEach((field) => {
        const rankCell = document.createElement("td");
        rankCell.className = "rank-cell";
        const rank = parseRankValue(entry.scores?.[subject]?.[field]);
        rankCell.textContent = Number.isInteger(rank) ? String(rank) : "";
        row.appendChild(rankCell);
      });
    });
    if (hasTotalScore) {
      const totalScoreCell = document.createElement("td");
      totalScoreCell.className = "score-cell";
      const totalScore = parseScoreValue(entry.total?.score);
      totalScoreCell.textContent = Number.isFinite(totalScore) ? String(totalScore) : "";
      row.appendChild(totalScoreCell);
    }
    if (hasTotalClassRank) {
      const totalClassRankCell = document.createElement("td");
      totalClassRankCell.className = "rank-cell";
      const totalClassRank = parseRankValue(entry.total?.rankClass);
      totalClassRankCell.textContent = Number.isInteger(totalClassRank) ? String(totalClassRank) : "";
      row.appendChild(totalClassRankCell);
    }
    if (hasTotalSchoolRank) {
      const totalSchoolRankCell = document.createElement("td");
      totalSchoolRankCell.className = "rank-cell";
      const totalSchoolRank = parseRankValue(entry.total?.rankSchool);
      totalSchoolRankCell.textContent = Number.isInteger(totalSchoolRank) ? String(totalSchoolRank) : "";
      row.appendChild(totalSchoolRankCell);
    }
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  savedExamTableWrap.appendChild(table);
  savedExamTableModal.classList.remove("hidden");
  savedExamTableModal.setAttribute("aria-hidden", "false");
  setTimeout(() => savedExamSearchInput?.focus(), 0);
}

function closeSavedExamTable() {
  if (!savedExamTableModal) {
    return;
  }
  activeSavedExamTableId = "";
  savedExamTableModal.classList.add("hidden");
  savedExamTableModal.setAttribute("aria-hidden", "true");
}

function normalizeSavedExamSearchKey(value) {
  return normalizeName(value).toLowerCase();
}

function getSavedExamSearchKeys(studentName) {
  const keys = new Set([normalizeSavedExamSearchKey(studentName)]);
  buildPinyinSearchKeys(studentName).forEach((key) => keys.add(key));
  const nameKey = normalizeSavedExamSearchKey(studentName);
  state.students.forEach((student) => {
    if (normalizeSavedExamSearchKey(student.name) !== nameKey) {
      return;
    }
    (student.aliases || []).forEach((alias) => {
      const aliasKey = normalizeSavedExamSearchKey(alias);
      if (aliasKey) {
        keys.add(aliasKey);
      }
      buildPinyinSearchKeys(alias).forEach((key) => keys.add(key));
    });
  });
  return [...keys].filter(Boolean);
}

function clearSavedExamSearchHighlight() {
  if (!savedExamTableWrap) {
    return;
  }
  savedExamTableWrap.querySelectorAll(".saved-exam-highlight").forEach((row) => {
    row.classList.remove("saved-exam-highlight");
  });
}

function isSubsequenceSearchKey(query, target) {
  if (!/^[a-z0-9]+$/.test(query) || !/^[a-z0-9]+$/.test(target) || query.length > target.length) {
    return false;
  }
  let queryIndex = 0;
  for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
    if (target[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length;
}

function findSavedExamSearchMatches(query) {
  if (!savedExamTableWrap) {
    return [];
  }
  const key = normalizeSavedExamSearchKey(query);
  if (!key) {
    return [];
  }
  const rows = [...savedExamTableWrap.querySelectorAll("tbody tr")];
  return rows
    .map((row) => {
      const keys = (row.dataset.searchKeys || row.dataset.normalizedName || "").split("|").filter(Boolean);
      let score = -1;
      if (keys.some((item) => item === key)) {
        score = 100;
      } else if (keys.some((item) => item.startsWith(key))) {
        score = 80;
      } else if (keys.some((item) => item.includes(key) || key.includes(item))) {
        score = 60;
      } else if (key.length >= 2 && keys.some((item) => isSubsequenceSearchKey(key, item))) {
        score = 45;
      }
      return { row, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || Number(a.row.dataset.rowIndex || 0) - Number(b.row.dataset.rowIndex || 0));
}

function selectSavedExamSearchRow(row) {
  if (!savedExamTableWrap || !row) {
    return;
  }
  clearSavedExamSearchHighlight();
  row.classList.add("saved-exam-highlight");
  const targetTop = row.offsetTop - savedExamTableWrap.clientHeight / 2 + row.offsetHeight / 2;
  savedExamTableWrap.scrollTo({
    top: Math.max(0, targetTop),
    left: 0,
    behavior: "smooth"
  });
  if (savedExamSearchStatus) {
    savedExamSearchStatus.textContent = `已定位到第 ${row.dataset.rowIndex || ""} 行：${row.dataset.studentName || ""}`;
  }
}

function renderSavedExamSearchChoices(matches, query) {
  if (!savedExamSearchResults) {
    return;
  }
  savedExamSearchResults.innerHTML = "";
  if (!matches.length) {
    savedExamSearchResults.classList.remove("has-results");
    return;
  }
  savedExamSearchResults.classList.add("has-results");
  const visibleMatches = matches.slice(0, 12);
  visibleMatches.forEach(({ row }) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "saved-exam-search-choice";
    const name = document.createElement("strong");
    name.textContent = row.dataset.studentName || "";
    const position = document.createElement("span");
    position.textContent = `第 ${row.dataset.rowIndex || ""} 行`;
    option.append(name, position);
    option.addEventListener("click", () => selectSavedExamSearchRow(row));
    savedExamSearchResults.appendChild(option);
  });
  if (matches.length > visibleMatches.length) {
    const more = document.createElement("div");
    more.className = "saved-exam-search-more muted";
    more.textContent = `还有 ${matches.length - visibleMatches.length} 个结果，请输入更完整的姓名或拼音。`;
    savedExamSearchResults.appendChild(more);
  }
  if (savedExamSearchStatus) {
    savedExamSearchStatus.textContent = `找到 ${matches.length} 个与「${query}」相关的学生，请选择一个。`;
  }
}

function searchSavedExamStudent() {
  if (!savedExamTableWrap || !savedExamSearchInput) {
    return;
  }
  const query = savedExamSearchInput.value.trim();
  const normalized = normalizeSavedExamSearchKey(query);
  clearSavedExamSearchHighlight();
  if (!normalized) {
    if (savedExamSearchStatus) {
      savedExamSearchStatus.textContent = "请输入要查找的学生姓名。";
    }
    if (savedExamSearchResults) {
      savedExamSearchResults.innerHTML = "";
      savedExamSearchResults.classList.remove("has-results");
    }
    return;
  }
  const matches = findSavedExamSearchMatches(query);
  if (!matches.length) {
    if (savedExamSearchStatus) {
      savedExamSearchStatus.textContent = `未找到「${query}」。`;
    }
    if (savedExamSearchResults) {
      savedExamSearchResults.innerHTML = "";
      savedExamSearchResults.classList.remove("has-results");
    }
    return;
  }
  renderSavedExamSearchChoices(matches, query);
}

function deleteSavedExamRecord(examId) {
  const exam = getSavedExamRecords().find((item) => item.id === examId);
  if (!exam) {
    return;
  }
  const label = `${exam.date || ""} ${exam.name || "考试"}`.trim();
  if (!confirm(`确定删除「${label}」这条历史考试记录吗？这不会影响学生、座位和当前标签。`)) {
    return;
  }
  state.savedExams = getSavedExamRecords().filter((item) => item.id !== examId);
  syncSavedExamsToStudentDetails();
  expandedSavedExamIds.delete(examId);
  saveState();
  renderExamManager();
  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamList(student);
    }
  }
  scoreStatus.textContent = "该历史考试已删除。";
  showToast("历史考试已删除", "success");
}

function saveSavedExamEdits(examId) {
  const exam = getSavedExamRecords().find((item) => item.id === examId);
  if (!exam || !savedExamList) {
    return;
  }
  const nameInput = savedExamList.querySelector(`input[data-exam-id="${examId}"][data-exam-field="name"]`);
  const dateInput = savedExamList.querySelector(`input[data-exam-id="${examId}"][data-exam-field="date"]`);
  const nextName = nameInput ? nameInput.value.trim() : exam.name;
  if (!nextName) {
    scoreStatus.textContent = "请填写考试名称。";
    nameInput?.focus();
    return;
  }
  exam.name = nextName;
  exam.date = dateInput ? dateInput.value : exam.date;
  syncSavedExamsToStudentDetails();
  saveState();
  renderExamManager();
  if (activeStudentId) {
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamList(student);
    }
  }
  scoreStatus.textContent = "历史考试信息已更新。";
  showToast("考试信息已更新", "success");
}

function renderLegacyExamManager() {
  if (!existingExamSelect) {
    return;
  }
  const currentValue = existingExamSelect.value;
  existingExamSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择已保存考试";
  existingExamSelect.appendChild(placeholder);

  const examMap = new Map();
  (Array.isArray(state.exams) ? state.exams : []).forEach((exam) => {
    if (exam?.id) {
      examMap.set(exam.id, { ...exam });
    }
  });
  state.students.forEach((student) => {
    (Array.isArray(student.exams) ? student.exams : []).forEach((exam) => {
      if (!exam?.id || examMap.has(exam.id)) {
        return;
      }
      examMap.set(exam.id, {
        id: exam.id,
        name: exam.name || "考试",
        date: exam.date || "",
        subjects: exam.subjects || []
      });
    });
  });
  const exams = [...examMap.values()];
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

function removeExamGlobally(examId, fallbackExam = null) {
  if (!examId) {
    return false;
  }
  let removed = false;
  state.students.forEach((student) => {
    if (!Array.isArray(student.exams)) {
      return;
    }
    const before = student.exams.length;
    student.exams = student.exams.filter((exam) => {
      const sameId = exam.id === examId;
      const sameFallback =
        fallbackExam &&
        !sameId &&
        (exam.name || "") === (fallbackExam.name || "") &&
        (exam.date || "") === (fallbackExam.date || "");
      return !sameId && !sameFallback;
    });
    if (student.exams.length !== before) {
      removed = true;
    }
  });
  const beforeGlobalExamCount = (state.exams || []).length;
  state.exams = (state.exams || []).filter((exam) => {
    const sameId = exam.id === examId;
    const sameFallback =
      fallbackExam &&
      !sameId &&
      (exam.name || "") === (fallbackExam.name || "") &&
      (exam.date || "") === (fallbackExam.date || "");
    return !sameId && !sameFallback;
  });
  if ((state.exams || []).length !== beforeGlobalExamCount) {
    removed = true;
  }
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

async function prepareScoreMapping(rows, filename) {
  const mapping = detectScoreMapping(rows);
  mappingState = { rows, headers: mapping.headers, suggestion: mapping, filename };
  openMappingModal(mapping.headers, mapping);
  scoreStatus.textContent = mapping.reliable
    ? "已自动识别列，请确认或手动调整映射。"
    : "未能可靠识别列，请手动选择映射。";
  if (mapping.reliable) {
    return;
  }
  scoreStatus.textContent = "本地识别不够可靠，正在尝试 AI 辅助映射。";
  try {
    const aiResult = await requestAiScoreMapping(rows, filename, mapping);
    if (!aiResult.ok) {
      const reasonText =
        {
          offline: "当前离线，无法使用 AI 映射，请手动选择映射。",
          too_large: "成绩表样例过大，无法使用 AI 映射，请手动选择映射。",
          no_auth: "尚未启用 AI 授权，请手动选择映射或先启用 AI。",
          expired: "AI 授权已过期，请重新启用后再试。",
          not_deployed: "AI 映射接口尚未部署到 Cloudflare，请先手动选择映射。",
          failed: "AI 映射暂时不可用，请手动选择映射。"
        }[aiResult.reason] || "AI 映射暂时不可用，请手动选择映射。";
      scoreStatus.textContent = reasonText;
      return;
    }
    if (mappingState?.rows !== rows) {
      scoreStatus.textContent = "未能可靠识别列，请手动选择映射。";
      return;
    }
    const aiMapping = aiResult.mapping;
    mappingState.suggestion = aiMapping;
    openMappingModal(aiMapping.headers, aiMapping);
    scoreStatus.textContent = "AI 已辅助填好映射，请确认或手动调整后再应用。";
  } catch (error) {
    scoreStatus.textContent = "AI 映射暂时不可用，请手动选择映射。";
  }
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
        scoreExamName.value = file.name.replace(/\.[^/.]+$/, "") || "考试";
        scoreExamDate.value = new Date().toISOString().slice(0, 10);
        saveScoreBtn.disabled = true;
        examDraft = null;
        prepareScoreMapping(rows, file.name);
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
        scoreExamName.value = file.name.replace(/\.[^/.]+$/, "") || "考试";
        scoreExamDate.value = new Date().toISOString().slice(0, 10);
        saveScoreBtn.disabled = true;
        examDraft = null;
        prepareScoreMapping(rows, file.name);
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
  if (aiTrendResult) {
    aiTrendResult.classList.add("hidden");
    aiTrendResult.innerHTML = "";
  }
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
    if (aiTrendBtn) {
      aiTrendBtn.disabled = true;
    }
    return;
  }
  if (aiTrendBtn) {
    aiTrendBtn.disabled = false;
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
  const trendMode = ["all", "score", "rankClass", "rankSchool"].includes(examTrendMode) ? examTrendMode : "all";
  const selectedMetricLabel = getTrendMetricLabel(trendMode);
  const totalDetails = chronological.map((exam, index) => ({
    name: exam.name || "考试",
    date: exam.date || "",
    value: null,
    scoreValue: parseScoreValue(exam.total?.score) ?? sumExamScores(exam.scores),
    rankClass: parseRankValue(exam.total?.rankClass),
    rankSchool: parseRankValue(exam.total?.rankSchool)
  }));
  const totalSeries = buildTrendSeries(totalDetails, trendMode, "总分");
  const totalHasChart = totalSeries.some((series) => series.values.filter((value) => Number.isFinite(value)).length >= 2);

  if (totalHasChart) {
    const totalTitle =
      trendMode === "all" || trendMode === "score" ? "总分趋势" : `${selectedMetricLabel}趋势`;
    const card = createChartCard(totalTitle, labels, null, {
      width: 360,
      height: 140,
      series: totalSeries,
      details: totalDetails,
      scoreLabel: "总分",
      metricMode: trendMode
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
    const details = chronological.map((exam, index) => ({
      name: exam.name || "考试",
      date: exam.date || "",
      value: null,
      scoreValue: parseScoreValue(exam.scores?.[subject]),
      rankClass: parseRankValue(exam.scores?.[subject]?.rankClass),
      rankSchool: parseRankValue(exam.scores?.[subject]?.rankSchool)
    }));
    const series = buildTrendSeries(details, trendMode, `${subject}分数`);
    const hasChart = series.some((item) => item.values.filter((value) => Number.isFinite(value)).length >= 2);
    if (!hasChart) {
      return;
    }
    hasSubjectChart = true;
    const card = createChartCard(`${subject}${trendMode === "all" ? "" : selectedMetricLabel}趋势`, labels, null, {
      width: 240,
      height: 120,
      series,
      details,
      scoreLabel: `${subject}分数`,
      metricMode: trendMode
    });
    subjectCards.appendChild(card);
  });

  if (hasSubjectChart) {
    examTrends.appendChild(subjectCards);
  } else if (!totalHasChart) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent =
      trendMode === "all" ? "暂无可用的成绩趋势数据。" : `暂无可用的${selectedMetricLabel}趋势数据。`;
    examTrends.appendChild(empty);
  }

  return totalHasChart || hasSubjectChart;
}

function getAiWorkerBaseUrl() {
  try {
    return (AI_DEFAULT_WORKER_URL || localStorage.getItem(AI_WORKER_URL_KEY) || "").trim().replace(/\/+$/, "");
  } catch (error) {
    return (AI_DEFAULT_WORKER_URL || "").trim().replace(/\/+$/, "");
  }
}

function setAiWorkerBaseUrl(url) {
  const normalized = (url || "").trim().replace(/\/+$/, "");
  if (!normalized) {
    return;
  }
  localStorage.setItem(AI_WORKER_URL_KEY, normalized);
}

function getStoredAiAuth() {
  const now = Date.now();
  const candidates = [
    {
      token: localStorage.getItem(AI_AUTH_TOKEN_KEY),
      expiresAt: Number.parseInt(localStorage.getItem(AI_AUTH_EXPIRES_KEY) || "", 10)
    },
    {
      token: sessionStorage.getItem(AI_AUTH_SESSION_TOKEN_KEY),
      expiresAt: Number.parseInt(sessionStorage.getItem(AI_AUTH_SESSION_EXPIRES_KEY) || "", 10)
    }
  ];
  const match = candidates.find((item) => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now);
  return match || null;
}

function storeAiAuth(token, expiresAt, remember) {
  clearAiAuth(false);
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(remember ? AI_AUTH_TOKEN_KEY : AI_AUTH_SESSION_TOKEN_KEY, token);
  storage.setItem(remember ? AI_AUTH_EXPIRES_KEY : AI_AUTH_SESSION_EXPIRES_KEY, String(expiresAt));
}

function clearAiAuth(showMessage = true) {
  localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
  if (showMessage) {
    showToast("已清除本设备 AI 授权");
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getAiCacheSignature(scope, payload) {
  const text = `${scope}:${stableStringify(payload)}`;
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return `${scope}:${(hash >>> 0).toString(36)}:${text.length}`;
}

function readAiResultCache() {
  try {
    return JSON.parse(localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") || {};
  } catch (error) {
    return {};
  }
}

function getCachedAiResult(signature) {
  const cache = readAiResultCache();
  return cache[signature]?.data || null;
}

function storeCachedAiResult(signature, data) {
  const cache = readAiResultCache();
  cache[signature] = { savedAt: Date.now(), data };
  const entries = Object.entries(cache)
    .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))
    .slice(0, 30);
  localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function formatAiValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => formatAiValue(item))
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatAiValue(item);
        return formatted ? `${key}：${formatted}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value || "").trim();
}

function renderAiResult(container, data, statusText = "", fields = null) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  container.classList.remove("hidden");

  const head = document.createElement("div");
  head.className = "ai-trend-head";
  const title = document.createElement("div");
  title.className = "ai-trend-title";
  title.textContent = data.title || "AI 趋势建议";
  const headRight = document.createElement("div");
  headRight.className = "ai-trend-head-actions";
  const status = document.createElement("div");
  status.className = "ai-trend-status";
  status.textContent = statusText || "仅供教师参考";
  const closeBtn = document.createElement("button");
  closeBtn.className = "ai-result-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "关闭 AI 分析");
  closeBtn.addEventListener("click", () => {
    container.classList.add("hidden");
    container.innerHTML = "";
  });
  headRight.append(status, closeBtn);
  head.append(title, headRight);
  container.appendChild(head);

  const resultFields = fields || [
    ["总体判断", data.overall],
    ["重点变化", data.changes],
    ["建议关注", data.suggestions],
    ["参考提示", data.disclaimer]
  ];
  resultFields.forEach(([labelText, value]) => {
    const textValue = formatAiValue(value);
    if (!textValue) {
      return;
    }
    const block = document.createElement("div");
    block.className = "ai-trend-block";
    const label = document.createElement("div");
    label.className = "ai-trend-label";
    label.textContent = labelText;
    const text = document.createElement("div");
    text.className = "ai-trend-text";
    text.textContent = textValue;
    block.append(label, text);
    container.appendChild(block);
  });
}

function renderAiTrendResult(data, statusText = "") {
  renderAiResult(aiTrendResult, data, statusText);
}

function renderAiTrendMessage(message, tone = "muted") {
  renderAiTrendResult(
    {
      overall: message,
      disclaimer: tone === "error" ? "AI 分析暂时不可用，可先查看本地趋势。" : "原有本地成绩趋势不受影响。"
    },
    tone === "error" ? "暂不可用" : "提示"
  );
}

function buildLocalTrendSummary(exams) {
  const chronological = [...exams].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const totals = chronological
    .map((exam) => parseScoreValue(exam.total?.score) ?? sumExamScores(exam.scores))
    .filter((value) => Number.isFinite(value));
  const summary = [];
  if (totals.length >= 2) {
    const first = totals[0];
    const last = totals[totals.length - 1];
    const diff = Number((last - first).toFixed(1));
    summary.push(`总分较最早一次${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分。`);
  }

  const subjects = new Set();
  chronological.forEach((exam) => (exam.subjects || []).forEach((subject) => subjects.add(subject)));
  subjects.forEach((subject) => {
    const values = chronological
      .map((exam) => parseScoreValue(exam.scores?.[subject]))
      .filter((value) => Number.isFinite(value));
    if (values.length >= 2) {
      const diff = Number((values[values.length - 1] - values[0]).toFixed(1));
      if (Math.abs(diff) >= 5) {
        summary.push(`${subject}${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分。`);
      }
    }
  });
  return summary.length ? summary.join(" ") : "可用考试次数或有效分数较少，主要参考单次成绩和排名。";
}

function buildAiTrendPayload(student) {
  const exams = Array.isArray(student.exams) ? [...student.exams] : [];
  const recent = exams
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 6)
    .reverse()
    .map((exam) => {
      const subjects = {};
      (exam.subjects || []).forEach((subject) => {
        const subjectData = exam.scores?.[subject];
        subjects[subject] = {
          score: parseScoreValue(subjectData),
          rankClass: parseRankValue(subjectData?.rankClass),
          rankSchool: parseRankValue(subjectData?.rankSchool)
        };
      });
      return {
        name: exam.name || "考试",
        date: exam.date || "",
        totalScore: parseScoreValue(exam.total?.score) ?? sumExamScores(exam.scores),
        classRank: parseRankValue(exam.total?.rankClass),
        schoolRank: parseRankValue(exam.total?.rankSchool),
        subjects
      };
    });
  return {
    student: "学生A",
    recentExams: recent,
    localAnalysis: {
      summary: buildLocalTrendSummary(exams)
    }
  };
}

function getExamSortValue(exam) {
  const examOrder = (state.exams || []).findIndex((item) => item.id === exam.id);
  return `${exam.date || ""}::${String(examOrder).padStart(4, "0")}::${exam.name || ""}`;
}

function buildClassTrendPayload() {
  const students = state.students
    .map((student, index) => {
      const exams = Array.isArray(student.exams) ? [...student.exams] : [];
      const chronological = exams.sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
      if (chronological.length < 2) {
        return null;
      }
      const previous = chronological[chronological.length - 2];
      const latest = chronological[chronological.length - 1];
      const previousTotal = parseScoreValue(previous.total?.score) ?? sumExamScores(previous.scores);
      const latestTotal = parseScoreValue(latest.total?.score) ?? sumExamScores(latest.scores);
      const previousRank = parseRankValue(previous.total?.rankClass) ?? parseRankValue(previous.total?.rankSchool);
      const latestRank = parseRankValue(latest.total?.rankClass) ?? parseRankValue(latest.total?.rankSchool);
      if (!Number.isFinite(previousTotal) || !Number.isFinite(latestTotal)) {
        return null;
      }
      const subjectChanges = [];
      const subjects = new Set([...(previous.subjects || []), ...(latest.subjects || [])]);
      subjects.forEach((subject) => {
        const before = parseScoreValue(previous.scores?.[subject]);
        const after = parseScoreValue(latest.scores?.[subject]);
        if (!Number.isFinite(before) || !Number.isFinite(after)) {
          return;
        }
        const diff = Number((after - before).toFixed(1));
        if (Math.abs(diff) >= 8) {
          subjectChanges.push({ subject, diff });
        }
      });
      return {
        name: student.name,
        previousExam: previous.name || "上次考试",
        latestExam: latest.name || "最近考试",
        totalDiff: Number((latestTotal - previousTotal).toFixed(1)),
        latestTotal,
        rankDiff: Number.isFinite(previousRank) && Number.isFinite(latestRank) ? latestRank - previousRank : null,
        latestRank: Number.isFinite(latestRank) ? latestRank : null,
        subjectChanges: subjectChanges.slice(0, 4)
      };
    })
    .filter(Boolean);

  const focusCandidates = students
    .map((student) => ({
      ...student,
      concernScore:
        (student.totalDiff < 0 ? Math.abs(student.totalDiff) : 0) +
        (student.rankDiff > 0 ? Math.min(student.rankDiff, 100) / 2 : 0) +
        student.subjectChanges.filter((item) => item.diff < 0).length * 8
    }))
    .sort((a, b) => b.concernScore - a.concernScore || (a.name || "").localeCompare(b.name || ""))
    .slice(0, 30);

  return {
    className: "本班",
    examCount: state.exams.length,
    studentCount: state.students.length,
    comparedStudentCount: students.length,
    focusCandidates: focusCandidates.map(({ concernScore, ...item }) => item),
    localAnalysis: {
      totalImproved: students.filter((item) => item.totalDiff > 0).length,
      totalDeclined: students.filter((item) => item.totalDiff < 0).length,
      rankImproved: students.filter((item) => item.rankDiff < 0).length,
      rankDeclined: students.filter((item) => item.rankDiff > 0).length
    },
    localFocusReasons: Object.fromEntries(focusCandidates.map((item) => [item.name, buildClassFocusReason(item)]))
  };
}

function buildClassFocusReason(student) {
  const reasons = [];
  if (student.rankDiff > 0) {
    reasons.push(`排名退步${student.rankDiff}`);
  }
  if (student.totalDiff < 0) {
    reasons.push(`总分下降${Math.abs(student.totalDiff)}`);
  }
  const weakSubjects = (student.subjectChanges || [])
    .filter((item) => item.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 2)
    .map((item) => `${item.subject}下降${Math.abs(item.diff)}`);
  reasons.push(...weakSubjects);
  if (!reasons.length && student.rankDiff < 0) {
    reasons.push(`排名进步但仍需巩固`);
  }
  if (!reasons.length && student.totalDiff > 0) {
    reasons.push(`总分提升后需保持`);
  }
  return reasons.slice(0, 2).join("，") || "需继续观察";
}

function validateAiPayloadSize(payload) {
  return new Blob([JSON.stringify(payload)]).size <= AI_REQUEST_LIMIT_BYTES;
}

function openAiAuthModal() {
  return new Promise((resolve) => {
    if (!aiAuthModal || !aiAuthSubmit || !aiAuthCancel || !aiAuthClose) {
      resolve(null);
      return;
    }
    aiWorkerUrlInput.value = getAiWorkerBaseUrl();
    aiAccessCodeInput.value = "";
    aiRememberInput.checked = true;
    aiAuthError.textContent = "";
    if (aiWorkerUrlInput) {
      const workerField = aiWorkerUrlInput.closest(".form-row");
      const hasDefaultWorker = Boolean(AI_DEFAULT_WORKER_URL);
      if (workerField) {
        workerField.classList.toggle("hidden", hasDefaultWorker);
      }
      aiWorkerUrlInput.required = !hasDefaultWorker;
    }
    aiAuthModal.classList.remove("hidden");
    aiAuthModal.setAttribute("aria-hidden", "false");

    const cleanup = (result) => {
      aiAuthModal.classList.add("hidden");
      aiAuthModal.setAttribute("aria-hidden", "true");
      aiAuthSubmit.removeEventListener("click", submit);
      aiAuthCancel.removeEventListener("click", cancel);
      aiAuthClose.removeEventListener("click", cancel);
      aiAuthModal.removeEventListener("click", backdrop);
      aiAccessCodeInput.removeEventListener("keydown", keydown);
      resolve(result);
    };
    const cancel = () => cleanup(null);
    const submit = () => {
      const workerUrl = aiWorkerUrlInput.value.trim();
      const accessCode = aiAccessCodeInput.value.trim();
      if (!getAiWorkerBaseUrl() && !workerUrl) {
        aiAuthError.textContent = "请先配置 Worker 接口地址。";
        return;
      }
      if (!accessCode) {
        aiAuthError.textContent = "请输入 AI 使用码。";
        return;
      }
      cleanup({ workerUrl: workerUrl || getAiWorkerBaseUrl(), accessCode, remember: Boolean(aiRememberInput.checked) });
    };
    const backdrop = (event) => {
      if (event.target === aiAuthModal) {
        cancel();
      }
    };
    const keydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };
    aiAuthSubmit.addEventListener("click", submit);
    aiAuthCancel.addEventListener("click", cancel);
    aiAuthClose.addEventListener("click", cancel);
    aiAuthModal.addEventListener("click", backdrop);
    aiAccessCodeInput.addEventListener("keydown", keydown);
    setTimeout(() => (aiWorkerUrlInput.value ? aiAccessCodeInput : aiWorkerUrlInput).focus(), 0);
  });
}

async function requestAiAuth() {
  const input = await openAiAuthModal();
  if (!input) {
    return null;
  }
  setAiWorkerBaseUrl(input.workerUrl);
  const baseUrl = getAiWorkerBaseUrl();
  const response = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: input.accessCode, rememberDays: input.remember ? AI_REMEMBER_DAYS : 0 })
  });
  if (response.status === 403) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error("auth_failed");
  }
  const data = await response.json();
  if (!data?.token || !Number.isFinite(data.expiresAt)) {
    throw new Error("auth_failed");
  }
  storeAiAuth(data.token, data.expiresAt, input.remember);
  return { token: data.token, expiresAt: data.expiresAt };
}

async function ensureAiAuth() {
  const stored = getStoredAiAuth();
  if (stored) {
    return stored;
  }
  return requestAiAuth();
}

async function generateAiTrendAdvice() {
  const student = state.students.find((item) => item.id === activeStudentId);
  if (!student) {
    return;
  }
  if (window.location.protocol === "file:") {
    renderAiTrendMessage("当前是本地文件打开方式，浏览器会拦截 AI 网络请求。请通过 GitHub Pages 正式网页打开后再使用 AI。", "error");
    return;
  }
  if (!navigator.onLine) {
    renderAiTrendMessage("当前处于离线状态，联网后可使用 AI 趋势建议。");
    return;
  }
  const payload = buildAiTrendPayload(student);
  if (payload.recentExams.length < 2) {
    renderAiTrendMessage("至少需要两次考试记录，才能生成相对可靠的 AI 趋势建议。");
    return;
  }
  if (!validateAiPayloadSize(payload)) {
    renderAiTrendMessage("当前成绩摘要过大，已停止发送。请减少考试记录后再试。", "error");
    return;
  }
  const cacheSignature = getAiCacheSignature("student-trend", { studentId: activeStudentId, payload });
  const cached = getCachedAiResult(cacheSignature);
  if (cached) {
    renderAiTrendResult(cached, "已缓存");
    return;
  }

  aiTrendBtn.disabled = true;
  aiTrendBtn.textContent = "生成中";
  try {
    const auth = await ensureAiAuth();
    if (!auth) {
      return;
    }
    const baseUrl = getAiWorkerBaseUrl();
    const response = await fetch(`${baseUrl}/analyze-trend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify(payload)
    });
    if (response.status === 401) {
      clearAiAuth(false);
      const retryAuth = await requestAiAuth();
      if (!retryAuth) {
        return;
      }
      return generateAiTrendAdvice();
    }
    if (response.status === 403) {
      renderAiTrendMessage("AI 功能未授权。", "error");
      return;
    }
    if (!response.ok) {
      throw new Error("ai_failed");
    }
    const data = await response.json();
    storeCachedAiResult(cacheSignature, data);
    renderAiTrendResult(data, "已生成");
  } catch (error) {
    if (error.message === "unauthorized") {
      renderAiTrendMessage("AI 功能未授权。", "error");
    } else {
      renderAiTrendMessage("AI 分析暂时不可用，可先查看本地趋势。", "error");
    }
  } finally {
    aiTrendBtn.disabled = false;
    aiTrendBtn.textContent = "生成 AI 趋势建议";
  }
}

function renderClassAiMessage(message, tone = "muted") {
  renderAiResult(
    classAiTrendResult,
    { title: "全班 AI 分析", overall: message, disclaimer: tone === "error" ? "AI 分析暂时不可用，可先查看本地成绩记录。" : "原有本地成绩功能不受影响。" },
    tone === "error" ? "暂不可用" : "提示"
  );
}

function enrichFocusStudentsWithReasons(value, reasonMap = {}) {
  const text = formatAiValue(value);
  if (!text) {
    return "";
  }
  return text
    .split(/\n|；|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/（.+）|\(.+\)/.test(line)) {
        return line;
      }
      const name = line.replace(/^[\d.\s、-]+/, "").trim();
      const reason = reasonMap[name];
      return reason ? `${name}（${reason}）` : line;
    })
    .join("\n");
}

function renderClassAiResult(data, reasonMap = {}, statusText = "已生成") {
  renderAiResult(
    classAiTrendResult,
    { title: "全班 AI 分析" },
    statusText,
    [
      ["总体判断", data.overall],
      ["班级变化", data.classChanges || data.changes],
      ["重点关注", enrichFocusStudentsWithReasons(data.focusStudents || data.suggestions, reasonMap)],
      ["建议关注", data.suggestions],
      ["参考提示", data.disclaimer]
    ]
  );
}

async function generateClassAiTrendAdvice() {
  if (window.location.protocol === "file:") {
    renderClassAiMessage("当前是本地文件打开方式，浏览器会拦截 AI 网络请求。请通过 GitHub Pages 正式网页打开后再使用 AI。", "error");
    return;
  }
  if (!navigator.onLine) {
    renderClassAiMessage("当前处于离线状态，联网后可使用全班 AI 分析。");
    return;
  }
  classAiTrendBtn.disabled = true;
  classAiTrendBtn.textContent = "生成中";
  try {
    const payload = buildClassTrendPayload();
    const focusReasonMap = payload.localFocusReasons || {};
    const { localFocusReasons, ...safePayload } = payload;
    if (payload.comparedStudentCount < 2) {
      renderClassAiMessage("至少需要两次考试、且有多名学生可比较，才能生成全班 AI 分析。");
      return;
    }
    if (!validateAiPayloadSize(safePayload)) {
      renderClassAiMessage("当前全班成绩摘要过大，已停止发送。请减少考试记录后再试。", "error");
      return;
    }
    const cacheSignature = getAiCacheSignature("class-trend", safePayload);
    const cached = getCachedAiResult(cacheSignature);
    if (cached) {
      renderClassAiResult(cached, focusReasonMap, "已缓存");
      return;
    }
    const auth = await ensureAiAuth();
    if (!auth) {
      return;
    }
    const baseUrl = getAiWorkerBaseUrl();
    const response = await fetch(`${baseUrl}/analyze-class`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify(safePayload)
    });
    if (response.status === 401) {
      clearAiAuth(false);
      const retryAuth = await requestAiAuth();
      if (!retryAuth) {
        return;
      }
      return generateClassAiTrendAdvice();
    }
    if (response.status === 403) {
      renderClassAiMessage("AI 功能未授权。", "error");
      return;
    }
    if (!response.ok) {
      throw new Error("ai_failed");
    }
    const data = await response.json();
    storeCachedAiResult(cacheSignature, data);
    renderClassAiResult(data, focusReasonMap, "已生成");
  } catch (error) {
    if (error.message === "unauthorized") {
      renderClassAiMessage("AI 功能未授权。", "error");
    } else {
      renderClassAiMessage("AI 分析暂时不可用，可先查看本地成绩记录。", "error");
    }
  } finally {
    classAiTrendBtn.disabled = false;
    classAiTrendBtn.textContent = "生成全班 AI 分析";
  }
}

function getTrendMetricLabel(mode) {
  if (mode === "rankClass") {
    return "班级排名";
  }
  if (mode === "rankSchool") {
    return "年级排名";
  }
  return "分数";
}

function buildTrendSeries(details, mode, scoreLabel) {
  const allSeries = [
    {
      id: "score",
      label: scoreLabel,
      shortLabel: "分数",
      color: "#1c6f5f",
      reverseY: false,
      values: details.map((item) => (Number.isFinite(item.scoreValue) ? item.scoreValue : null))
    },
    {
      id: "rankClass",
      label: "班级排名",
      shortLabel: "班排",
      color: "#f0a202",
      reverseY: true,
      values: details.map((item) => (Number.isFinite(item.rankClass) ? item.rankClass : null))
    },
    {
      id: "rankSchool",
      label: "年级排名",
      shortLabel: "年排",
      color: "#3b82f6",
      reverseY: true,
      values: details.map((item) => (Number.isFinite(item.rankSchool) ? item.rankSchool : null))
    }
  ];
  if (mode === "score" || mode === "rankClass" || mode === "rankSchool") {
    return allSeries.filter((series) => series.id === mode);
  }
  return allSeries;
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
  card.tabIndex = 0;
  card.role = "button";
  card.setAttribute("aria-label", `查看${title}详情`);

  const header = document.createElement("div");
  header.className = "chart-title";
  header.textContent = title;

  const subtitle = document.createElement("div");
  subtitle.className = "chart-subtitle";
  subtitle.textContent = labels.join(" · ");

  const svg = createLineChart(values, options);
  svg.classList.add("chart-svg");

  card.append(header, subtitle, svg);
  const legend = createTrendLegend(options?.series || []);
  if (legend) {
    card.appendChild(legend);
  }
  card.addEventListener("click", () => {
    openTrendDetail(title, options?.details || [], options?.scoreLabel || "分数", options?.series || []);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTrendDetail(title, options?.details || [], options?.scoreLabel || "分数", options?.series || []);
    }
  });
  return card;
}

function createTrendLegend(series) {
  const visible = series.filter((item) => item.values?.some((value) => Number.isFinite(value)));
  if (visible.length <= 1) {
    return null;
  }
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  visible.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chart-legend-item";
    const dot = document.createElement("i");
    dot.style.background = item.color;
    chip.append(dot, document.createTextNode(item.shortLabel || item.label));
    legend.appendChild(chip);
  });
  return legend;
}

function openTrendDetail(title, details, scoreLabel, series = []) {
  if (!trendDetailModal || !trendDetailList) {
    return;
  }
  trendDetailTitle.textContent = title;
  const visibleSeries = series.filter((item) => item.values?.some((value) => Number.isFinite(value)));
  const metricText = visibleSeries.length > 1 ? "分数、班级排名、年级排名" : visibleSeries[0]?.label || scoreLabel;
  const validCount = visibleSeries.reduce(
    (count, item) => count + item.values.filter((value) => Number.isFinite(value)).length,
    0
  );
  trendDetailMeta.textContent = `${metricText} · ${details.length} 次考试 · ${validCount} 个有效数据`;
  trendDetailList.innerHTML = "";
  trendDetailList.appendChild(createTrendDetailChart(details, scoreLabel, series));

  trendDetailModal.classList.remove("hidden");
  trendDetailModal.setAttribute("aria-hidden", "false");
}

function createTrendDetailChart(details, scoreLabel, series = []) {
  const wrap = document.createElement("div");
  wrap.className = "trend-detail-chart-wrap";
  const width = Math.max(680, details.length * 150);
  const height = 360;
  const padding = { top: 56, right: 46, bottom: 100, left: 64 };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("trend-detail-chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const visibleSeries = (series.length ? series : buildTrendSeries(details, "score", scoreLabel)).filter((item) =>
    item.values?.some((value) => Number.isFinite(value))
  );
  if (!visibleSeries.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "暂无可绘制的趋势数据。";
    wrap.appendChild(empty);
    return wrap;
  }

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const getX = (index) => padding.left + (index / Math.max(details.length - 1, 1)) * chartWidth;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const getNormalizedY = (value, stats, reverseY) => {
    const range = stats.max - stats.min || 1;
    const normalized = reverseY ? (stats.max - value) / range : (value - stats.min) / range;
    return padding.top + (1 - normalized) * chartHeight;
  };

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axis.setAttribute("d", `M${padding.left} ${padding.top} V${padding.top + chartHeight} H${padding.left + chartWidth}`);
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "#e9edf3");
  axis.setAttribute("stroke-width", "1");
  svg.appendChild(axis);

  [0, 0.5, 1].forEach((ratio) => {
    const y = padding.top + ratio * chartHeight;
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
    grid.setAttribute("x1", padding.left);
    grid.setAttribute("x2", padding.left + chartWidth);
    grid.setAttribute("y1", y);
    grid.setAttribute("y2", y);
    grid.setAttribute("stroke", "#f0f2f5");
    grid.setAttribute("stroke-width", "1");
    svg.appendChild(grid);
  });

  const pointLabels = [];
  visibleSeries.forEach((item, seriesIndex) => {
    const numeric = item.values.filter((value) => Number.isFinite(value));
    const stats = { min: Math.min(...numeric), max: Math.max(...numeric) };
    const visualOffset = visibleSeries.length > 1 ? (seriesIndex - (visibleSeries.length - 1) / 2) * 10 : 0;
    const points = item.values.map((value, index) => ({
      index,
      value,
      x: getX(index),
      y: Number.isFinite(value)
        ? clamp(getNormalizedY(value, stats, item.reverseY) + visualOffset, padding.top + 8, padding.top + chartHeight - 8)
        : null,
      detail: details[index]
    }));
    const validPoints = points.filter((point) => point.y !== null);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", validPoints.map((point) => `${point.x},${point.y}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", item.color);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    if (visibleSeries.length > 1 && seriesIndex > 0) {
      line.setAttribute("stroke-dasharray", seriesIndex === 1 ? "8 6" : "3 6");
    }
    svg.appendChild(line);

    validPoints.forEach((point, pointIndex) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", item.color);
      svg.appendChild(circle);
      pointLabels.push({
        pointIndex: point.index,
        seriesIndex,
        x: point.x,
        y: point.y,
        text: `${item.shortLabel || item.label}${point.value}`
      });
    });
  });

  const labelsByPoint = new Map();
  pointLabels.forEach((label) => {
    if (!labelsByPoint.has(label.pointIndex)) {
      labelsByPoint.set(label.pointIndex, []);
    }
    labelsByPoint.get(label.pointIndex).push(label);
  });
  labelsByPoint.forEach((labels) => {
    const groupY = labels.reduce((sum, label) => sum + label.y, 0) / labels.length;
    const stackStart = clamp(groupY - ((labels.length - 1) * 15) / 2, padding.top + 14, padding.top + chartHeight - 10 - (labels.length - 1) * 15);
    labels
      .sort((a, b) => a.y - b.y || a.seriesIndex - b.seriesIndex)
      .forEach((label, labelIndex) => {
        const isFirstPoint = label.pointIndex === 0;
        const isLastPoint = label.pointIndex === details.length - 1;
        const anchor = isFirstPoint ? "start" : isLastPoint ? "end" : "middle";
        const labelX = clamp(label.x + (isFirstPoint ? 8 : isLastPoint ? -8 : 0), padding.left + 8, padding.left + chartWidth - 8);
        const labelY = stackStart + labelIndex * 15;
        const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
        value.setAttribute("x", labelX);
        value.setAttribute("y", labelY);
        value.setAttribute("text-anchor", anchor);
        value.setAttribute("class", "trend-point-score");
        value.textContent = label.text;
        svg.appendChild(value);
      });
  });

  details.forEach((item, index) => {
    const x = getX(index);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", height - 58);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "trend-x-label");
    const nameLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    nameLine.setAttribute("x", x);
    nameLine.textContent = truncateChartLabel(item.name || "考试", 8);
    const dateLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    dateLine.setAttribute("x", x);
    dateLine.setAttribute("dy", "16");
    dateLine.textContent = item.date || "未填写日期";
    label.append(nameLine, dateLine);
    svg.appendChild(label);
  });

  const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yTitle.setAttribute("x", padding.left);
  yTitle.setAttribute("y", 18);
  yTitle.setAttribute("class", "trend-axis-title");
  yTitle.textContent = visibleSeries.length > 1 ? "三项趋势（各自缩放）" : visibleSeries[0].label;
  svg.appendChild(yTitle);

  const legendGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  visibleSeries.forEach((item, index) => {
    const x = padding.left + index * 118;
    const y = height - 24;
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y - 4);
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", item.color);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x + 10);
    text.setAttribute("y", y);
    text.setAttribute("class", "trend-axis-label");
    text.textContent = item.label;
    legendGroup.append(dot, text);
  });
  svg.appendChild(legendGroup);

  wrap.appendChild(svg);
  return wrap;
}

function truncateChartLabel(value, maxLength) {
  const text = value.toString();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function closeTrendDetail() {
  if (!trendDetailModal) {
    return;
  }
  trendDetailModal.classList.add("hidden");
  trendDetailModal.setAttribute("aria-hidden", "true");
}

function createLineChart(values, options) {
  const width = options.width || 320;
  const height = options.height || 120;
  const padding = 16;
  const series = options.series?.length
    ? options.series.filter((item) => item.values?.some((value) => Number.isFinite(value)))
    : [
        {
          color: options.color || "#1c6f5f",
          reverseY: Boolean(options.reverseY),
          values: values || []
        }
      ];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!series.length) {
    return svg;
  }

  const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
  baseline.setAttribute("x1", padding);
  baseline.setAttribute("x2", width - padding);
  baseline.setAttribute("y1", height - padding);
  baseline.setAttribute("y2", height - padding);
  baseline.setAttribute("stroke", "#efe4d6");
  baseline.setAttribute("stroke-width", "1");

  svg.appendChild(baseline);

  series.forEach((item) => {
    const parsed = item.values.map((value) => (Number.isFinite(value) ? value : null));
    const numericValues = parsed.filter((value) => value !== null);
    if (!numericValues.length) {
      return;
    }
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const range = max - min || 1;
    const points = parsed.map((value, index) => {
      const x = padding + (index / Math.max(parsed.length - 1, 1)) * (width - padding * 2);
      if (value === null) {
        return { x, y: null };
      }
      const normalized = item.reverseY ? (max - value) / range : (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return { x, y };
    });
    const pathPoints = points.filter((point) => point.y !== null);
    if (!pathPoints.length) {
      return;
    }
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", pathPoints.map((point) => `${point.x},${point.y}`).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", item.color || "#1c6f5f");
    polyline.setAttribute("stroke-width", "2");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    svg.appendChild(polyline);
    pathPoints.forEach((point) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", item.color || "#1c6f5f");
      svg.appendChild(circle);
    });
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
  const appendName = (parent, name) => {
    const strong = document.createElement("strong");
    strong.className = "constraint-name";
    strong.textContent = name;
    parent.appendChild(strong);
  };

  lockPairList.innerHTML = "";
  if (!state.settings.constraints.lockedDeskmatePairs.length) {
    const empty = document.createElement("div");
    empty.className = "draw-status";
    empty.textContent = "暂无必须安排同桌的学生。";
    lockPairList.appendChild(empty);
  } else {
    state.settings.constraints.lockedDeskmatePairs.forEach((pair, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      appendName(label, idToName.get(pair.a) || "未知");
      label.append(" 和 ");
      appendName(label, idToName.get(pair.b) || "未知");
      label.append(" 安排同桌");
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
    empty.textContent = "暂无需要避免同桌的学生。";
    noDeskPairList.appendChild(empty);
  } else {
    state.settings.constraints.noDeskmatePairs.forEach((pair, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      appendName(label, idToName.get(pair.a) || "未知");
      label.append(" 不和 ");
      appendName(label, idToName.get(pair.b) || "未知");
      label.append(" 同桌");
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
    empty.textContent = "暂无需要坐前排的学生。";
    frontStudentList.appendChild(empty);
  } else {
    const frontRows = Math.max(1, Number.parseInt(state.settings.constraints.frontRows, 10) || 2);
    state.settings.constraints.frontRowStudentIds.forEach((id, index) => {
      const item = document.createElement("div");
      item.className = "constraint-item";
      const label = document.createElement("span");
      appendName(label, idToName.get(id) || "未知");
      label.append(` 坐前 ${frontRows} 排`);
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
  renderSeatRuleSummary();
}

function renderComplementRuleSettings() {
  if (!complementRuleSettings) {
    return;
  }
  const selectedIds = new Set(state.settings.complementRuleIds || []);
  complementRuleSettings.innerHTML = "";
  COMPLEMENT_RULES.forEach((rule) => {
    const label = document.createElement("label");
    label.className = "complement-rule-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = rule.id;
    checkbox.checked = selectedIds.has(rule.id);
    checkbox.addEventListener("change", () => {
      const next = new Set(state.settings.complementRuleIds || []);
      if (checkbox.checked) {
        next.add(rule.id);
      } else {
        next.delete(rule.id);
      }
      state.settings.complementRuleIds = COMPLEMENT_RULES.filter((item) => next.has(item.id)).map((item) => item.id);
      saveState();
      renderSeatRuleSummary();
      renderSeatGrid();
    });
    const text = document.createElement("span");
    text.textContent = rule.labelZh;
    label.append(checkbox, text);
    complementRuleSettings.appendChild(label);
  });
}

function renderSeatRuleSummary() {
  if (!seatRuleStatus || !seatRuleSummaryChips) {
    return;
  }
  const constraints = state.settings.constraints || {};
  const lockPairCount = (constraints.lockedDeskmatePairs || []).length;
  const noPairCount = (constraints.noDeskmatePairs || []).length;
  const frontStudentCount = (constraints.frontRowStudentIds || []).length;
  const explicitCount = lockPairCount + noPairCount + frontStudentCount;
  const complementCount = (state.settings.complementRuleIds || []).length;
  const lockedSeatCount = (state.lockedSeats || []).length;
  const keepEmptyText = state.settings.keepLockedEmpty ? "开启" : "关闭";

  const setStatus = (parts) => {
    seatRuleStatus.innerHTML = "";
    parts.forEach((part) => {
      if (typeof part === "string") {
        seatRuleStatus.append(document.createTextNode(part));
        return;
      }
      const strong = document.createElement("strong");
      strong.textContent = part.text;
      seatRuleStatus.append(strong);
    });
  };

  if (explicitCount > 0) {
    const softParts = [];
    if (state.settings.pairByGender) {
      softParts.push("男女搭配");
    }
    if (complementCount > 0) {
      softParts.push({ text: `${complementCount} 类互补关系` });
    }
    const statusParts = ["随机排座会先满足 ", { text: `${explicitCount} 条明确要求` }];
    if (softParts.length) {
      statusParts.push("，再尽量照顾");
      softParts.forEach((part, index) => {
        if (index > 0) {
          statusParts.push("、");
        }
        statusParts.push(part);
      });
    }
    statusParts.push("。");
    setStatus(statusParts);
  } else if (state.settings.pairByGender || complementCount > 0) {
    const softParts = [];
    if (state.settings.pairByGender) {
      softParts.push("男女搭配");
    }
    if (complementCount > 0) {
      softParts.push(`${complementCount} 类互补关系`);
    }
    setStatus(["暂无明确要求，随机排座会尽量照顾", { text: softParts.join("、") }, "。"]);
  } else {
    setStatus(["暂无明确要求，点击随机排座将按当前名单随机生成。"]);
  }

  const chips = [
    { title: "安排同桌", value: `${lockPairCount} 条`, tone: "must" },
    { title: "避免同桌", value: `${noPairCount} 条`, tone: "must" },
    {
      title: "前排照顾",
      value: frontStudentCount ? `${frontStudentCount} 人，坐前 ${constraints.frontRows || 2} 排` : "0 人",
      tone: "must"
    },
    { title: "座位保护", value: `${lockedSeatCount} 个锁定，空座${keepEmptyText}`, tone: "must" },
    { title: "男女搭配", value: state.settings.pairByGender ? "开启" : "关闭", tone: "soft" },
    { title: "互补关系", value: complementCount ? `${complementCount} 类` : "未启用", tone: "soft" }
  ];

  seatRuleSummaryChips.innerHTML = "";
  chips.forEach((chip) => {
    const item = document.createElement("div");
    item.className = `seat-rule-chip ${chip.tone}`;
    const title = document.createElement("strong");
    title.textContent = chip.title;
    const value = document.createElement("span");
    value.textContent = chip.value;
    item.append(title, value);
    seatRuleSummaryChips.appendChild(item);
  });
}

function renderAll() {
  normalizeState();
  syncSavedExamsToStudentDetails();
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
  renderComplementRuleSettings();
  renderSeatRuleSummary();
  renderBackupInfo();
  renderUndoSeatChange();
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
    document.documentElement.style.setProperty("--seat-height", `${getUniformSeatHeight()}px`);
    cardCompactBtn.classList.toggle("active", compact);
    cardDetailBtn.classList.toggle("active", !compact);
    localStorage.setItem(SEAT_CARD_MODE_KEY, compact ? "compact" : "detail");
  };

  const saved = localStorage.getItem(SEAT_CARD_MODE_KEY);
  applyMode(saved === "detail" ? "detail" : "compact");

  cardCompactBtn.addEventListener("click", () => applyMode("compact"));
  cardDetailBtn.addEventListener("click", () => applyMode("detail"));
}

function initAnimatedDetails() {
  const animatedDetails = Array.from(
    document.querySelectorAll(".inline-more, .constraint-advanced, .auto-tag-settings")
  );
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  const duration = 360;
  const contentDuration = 240;

  const getCollapsedHeight = (details) => {
    const summaryHeight = details.querySelector("summary")?.offsetHeight || 0;
    const style = window.getComputedStyle(details);
    const borderY = parseFloat(style.borderTopWidth || "0") + parseFloat(style.borderBottomWidth || "0");
    const paddingY = parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0");
    return summaryHeight + borderY + paddingY;
  };
  const getExpandedHeight = (details) => {
    const style = window.getComputedStyle(details);
    const borderY = parseFloat(style.borderTopWidth || "0") + parseFloat(style.borderBottomWidth || "0");
    return details.scrollHeight + borderY;
  };
  const getContentNodes = (details) => Array.from(details.children).filter((node) => node.tagName !== "SUMMARY");
  const refreshSidebarTabHeight = (details) => {
    const viewport = details.closest(".sidebar-tab-viewport");
    const activeSection = details.closest(".sidebar-section.is-active-tab");
    if (viewport && activeSection) {
      viewport.style.setProperty("--sidebar-tab-height", `${activeSection.scrollHeight}px`);
    }
  };
  const getDetailsScrollContainer = (details) => {
    const viewport = details.closest(".sidebar-tab-viewport");
    if (viewport && viewport.scrollHeight > viewport.clientHeight + 2) {
      return viewport;
    }
    return document.scrollingElement || document.documentElement;
  };

  const scrollExpandedDetailsIntoView = (details) => {
    refreshSidebarTabHeight(details);
    const scroller = getDetailsScrollContainer(details);
    if (!scroller) {
      return;
    }
    const contentNodes = getContentNodes(details);
    const target = contentNodes[contentNodes.length - 1] || details;
    requestAnimationFrame(() => {
      refreshSidebarTabHeight(details);
      const targetRect = target.getBoundingClientRect();
      const scrollerRect =
        scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect();
      const bottomPadding = 18;
      const topPadding = 12;
      const overflowBottom = targetRect.bottom - (scrollerRect.bottom - bottomPadding);
      const overflowTop = targetRect.top - (scrollerRect.top + topPadding);
      if (overflowBottom > 0) {
        scroller.scrollTo({
          top: scroller.scrollTop + overflowBottom,
          behavior: reduceMotion.matches ? "auto" : "smooth"
        });
      } else if (overflowTop < 0) {
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + overflowTop),
          behavior: reduceMotion.matches ? "auto" : "smooth"
        });
      }
    });
  };

  const resetDetailsStyles = (details) => {
    details.style.height = "";
    details.style.overflow = "";
    details.classList.remove("is-expanding", "is-collapsing", "is-animating-details");
    getContentNodes(details).forEach((node) => {
      node.style.opacity = "";
      node.style.transform = "";
    });
  };

  const finishDetailsAnimation = (details, finalHeight, callback) => {
    details.style.height = `${finalHeight}px`;
    requestAnimationFrame(() => {
      resetDetailsStyles(details);
      callback?.();
    });
  };

  animatedDetails.forEach((details) => {
    const summary = details.querySelector("summary");
    if (!summary || details.dataset.animatedDetails === "true") {
      return;
    }
    details.dataset.animatedDetails = "true";

    summary.addEventListener("click", (event) => {
      event.preventDefault();

      if (reduceMotion.matches) {
        details.open = !details.open;
        resetDetailsStyles(details);
        if (details.open) {
          scrollExpandedDetailsIntoView(details);
        }
        return;
      }

      details.getAnimations().forEach((animation) => animation.cancel());
      const contentNodes = getContentNodes(details);
      contentNodes.forEach((node) => {
        node.getAnimations().forEach((animation) => animation.cancel());
      });

      if (details.open) {
        const startHeight = details.offsetHeight;
        const endHeight = getCollapsedHeight(details);
        details.classList.add("is-collapsing", "is-animating-details");
        details.style.height = `${startHeight}px`;
        details.style.overflow = "hidden";

        contentNodes.forEach((node) => {
          node.animate(
            [
              { opacity: 1 },
              { opacity: 0 }
            ],
            { duration: contentDuration, easing, fill: "forwards" }
          );
        });

        const animation = details.animate(
          [
            { height: `${startHeight}px` },
            { height: `${endHeight}px` }
          ],
          { duration, easing }
        );

        animation.onfinish = () => {
          finishDetailsAnimation(details, endHeight, () => {
            details.open = false;
          });
        };
        animation.oncancel = () => resetDetailsStyles(details);
        return;
      }

      const startHeight = details.offsetHeight;
      details.classList.add("is-expanding", "is-animating-details");
      details.style.height = `${startHeight}px`;
      details.style.overflow = "hidden";
      details.open = true;

      requestAnimationFrame(() => {
        const endHeight = getExpandedHeight(details);

        contentNodes.forEach((node) => {
          node.animate(
            [
              { opacity: 0 },
              { opacity: 1 }
            ],
            { duration: contentDuration, easing, fill: "forwards" }
          );
        });

        const animation = details.animate(
          [
            { height: `${startHeight}px` },
            { height: `${endHeight}px` }
          ],
          { duration, easing }
        );

        animation.onfinish = () => finishDetailsAnimation(details, endHeight, () => {
          scrollExpandedDetailsIntoView(details);
        });
        animation.oncancel = () => resetDetailsStyles(details);
      });
    });
  });
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
  const nav = sidebar.querySelector(".sidebar-quick-nav");
  const track = sidebar.querySelector(".sidebar-tab-track");
  const viewport = sidebar.querySelector(".sidebar-tab-viewport");
  const indicator = sidebar.querySelector(".quick-pill-indicator");
  sidebar.style.setProperty("--sidebar-tab-count", sections.length);

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
  let activeTabId = "";

  const setActivePillById = (id) => {
    pills.forEach((item) => {
      item.classList.toggle("active", item.dataset.target === id);
      item.setAttribute("aria-selected", item.dataset.target === id ? "true" : "false");
    });
  };

  const syncActiveTabMetrics = () => {
    const activePill = pills.find((item) => item.dataset.target === activeTabId);
    if (indicator && activePill) {
      indicator.style.setProperty("--quick-pill-x", `${activePill.offsetLeft}px`);
      indicator.style.setProperty("--quick-pill-width", `${activePill.offsetWidth}px`);
      indicator.style.setProperty("--quick-pill-height", `${activePill.offsetHeight}px`);
      activePill.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    const activeSection = sections.find((section) => section.id === activeTabId);
    if (viewport && activeSection) {
      viewport.style.setProperty("--sidebar-tab-height", `${activeSection.scrollHeight}px`);
    }
  };

  const setActiveTab = (id) => {
    let resolvedId = id;
    if (!sections.some((section) => section.id === resolvedId)) {
      resolvedId = "sec-common";
    }
    activeTabId = resolvedId;
    setActivePillById(resolvedId);
    const activeIndex = Math.max(0, sections.findIndex((section) => section.id === resolvedId));
    if (track) {
      track.style.setProperty("--sidebar-tab-index", activeIndex);
    }
    sections.forEach((section) => {
      const isActive = section.id === resolvedId;
      if (!section.open) {
        section.open = true;
      }
      section.hidden = false;
      section.setAttribute("aria-hidden", isActive ? "false" : "true");
      section.classList.toggle("is-active-tab", isActive);
    });
    requestAnimationFrame(syncActiveTabMetrics);
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
    });
  });

  if (nav) {
    nav.setAttribute("role", "tablist");
  }
  pills.forEach((pill) => {
    pill.setAttribute("role", "tab");
  });
  window.addEventListener("resize", syncActiveTabMetrics);
  sidebar.addEventListener("toggle", () => {
    requestAnimationFrame(syncActiveTabMetrics);
  }, true);
}

function applySidebarState() {
  const app = document.querySelector(".app");
  if (state.settings.sidebarCollapsed) {
    app.classList.add("sidebar-collapsed");
    toggleSidebarBtn.textContent = "展开侧栏";
    toggleSidebarBtn.setAttribute("aria-expanded", "false");
  } else {
    app.classList.remove("sidebar-collapsed");
    toggleSidebarBtn.textContent = "收起侧栏";
    toggleSidebarBtn.setAttribute("aria-expanded", "true");
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

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = loginPassword.value;
    const setupConfirm = loginSetupConfirm?.value || "";
    if (!hasLoginPassword()) {
      if (password.length < 4) {
        loginError.textContent = "密码至少需要 4 位。";
        loginPassword.focus();
        return;
      }
      if (password !== setupConfirm) {
        loginError.textContent = "两次输入的密码不一致。";
        loginSetupConfirm?.focus();
        return;
      }
      localStorage.setItem(CUSTOM_PASSWORD_HASH_KEY, await hashPassword(password));
      setAuthenticated(loginRemember.checked);
      showApp();
      return;
    }
    if (await verifyPassword(password)) {
      setAuthenticated(loginRemember.checked);
      showApp();
      return;
    }
    loginError.textContent = "密码不正确，请重试。";
    loginPassword.value = "";
    loginPassword.focus();
  });
}

if (changePasswordBtn) {
  changePasswordBtn.addEventListener("click", openChangePasswordModal);
}

if (changePasswordClose) {
  changePasswordClose.addEventListener("click", closeChangePasswordModal);
}

if (changePasswordCancel) {
  changePasswordCancel.addEventListener("click", closeChangePasswordModal);
}

if (changePasswordModal) {
  changePasswordModal.addEventListener("click", (event) => {
    if (event.target === changePasswordModal) {
      closeChangePasswordModal();
    }
  });
}

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    if (!await verifyPassword(currentPassword)) {
      changePasswordError.textContent = "当前密码不正确，请重试。";
      currentPasswordInput.focus();
      return;
    }
    if (newPassword.length < 4) {
      changePasswordError.textContent = "新密码至少需要 4 位。";
      newPasswordInput.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      changePasswordError.textContent = "两次输入的新密码不一致。";
      confirmPasswordInput.focus();
      return;
    }
    localStorage.setItem(CUSTOM_PASSWORD_HASH_KEY, await hashPassword(newPassword));
    clearAuth();
    closeChangePasswordModal();
    showLogin();
    loginError.textContent = "密码已修改，请使用新密码重新登录。";
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuth();
    showLogin();
  });
}

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

if (undoSeatChangeBtn) {
  undoSeatChangeBtn.addEventListener("click", undoSeatChange);
}

if (shufflePreviewClose) {
  shufflePreviewClose.addEventListener("click", closeShufflePreview);
}
if (shufflePreviewCancel) {
  shufflePreviewCancel.addEventListener("click", closeShufflePreview);
}
if (shufflePreviewAgain) {
  shufflePreviewAgain.addEventListener("click", () => {
    const result = buildBestShuffleCandidate();
    if (result) {
      activeShufflePreviewDetail = "required";
      pendingShufflePreview = {
        order: [...result.order],
        eval: result.eval
      };
      renderShufflePreview(result);
    }
  });
}
if (shufflePreviewApply) {
  shufflePreviewApply.addEventListener("click", applyShufflePreview);
}
if (shufflePreviewModal) {
  shufflePreviewModal.addEventListener("click", (event) => {
    if (event.target === shufflePreviewModal) {
      closeShufflePreview();
    }
  });
}

function updateImportHistoryOption() {
  if (!importKeepHistory) {
    return;
  }
  const isReplace = Boolean(importReplace?.checked);
  importKeepHistory.disabled = !isReplace;
  importKeepHistory.parentElement?.classList.toggle("muted", !isReplace);
}

if (importReplace) {
  importReplace.addEventListener("change", updateImportHistoryOption);
  updateImportHistoryOption();
}

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
    scoreStatus.textContent = "请先上传并解析成绩表";
    return;
  }
  saveExamRecord();
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
    const exam =
      (state.exams || []).find((item) => item.id === examId) ||
      state.students.flatMap((student) => (Array.isArray(student.exams) ? student.exams : [])).find((item) => item.id === examId);
    const label = `${exam?.name || "考试"} ${exam?.date || ""}`.trim();
    if (!confirm(`确定整体删除「${label}」这次考试吗？这会删除所有学生的该次成绩。`)) {
      return;
    }
    if (!removeExamGlobally(examId, exam)) {
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

if (savedExamList) {
  savedExamList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const actionButton = target.closest("[data-action]");
    if (actionButton) {
      const examId = actionButton.dataset.examId || "";
      if (actionButton.dataset.action === "view-saved-exam") {
        openSavedExamTable(examId);
      }
      if (actionButton.dataset.action === "save-saved-exam") {
        saveSavedExamEdits(examId);
      }
      if (actionButton.dataset.action === "delete-saved-exam") {
        deleteSavedExamRecord(examId);
      }
      return;
    }
    const row = target.closest(".saved-exam-row");
    if (!row) {
      return;
    }
    const examId = row.dataset.examId || "";
    if (expandedSavedExamIds.has(examId)) {
      expandedSavedExamIds.delete(examId);
    } else {
      expandedSavedExamIds.add(examId);
    }
    renderSavedExamList();
  });
}

if (savedExamTableClose) {
  savedExamTableClose.addEventListener("click", closeSavedExamTable);
}

if (trendDetailClose) {
  trendDetailClose.addEventListener("click", closeTrendDetail);
}

if (trendDetailModal) {
  trendDetailModal.addEventListener("click", (event) => {
    if (event.target === trendDetailModal) {
      closeTrendDetail();
    }
  });
}

if (savedExamSearchBtn) {
  savedExamSearchBtn.addEventListener("click", searchSavedExamStudent);
}

if (savedExamSearchInput) {
  savedExamSearchInput.addEventListener("input", () => {
    clearSavedExamSearchHighlight();
    if (savedExamSearchResults) {
      savedExamSearchResults.innerHTML = "";
      savedExamSearchResults.classList.remove("has-results");
    }
    if (savedExamSearchStatus) {
      savedExamSearchStatus.textContent = savedExamSearchInput.value.trim()
        ? "点击搜索查看候选学生。"
        : "可输入姓名、拼音、首字母或部分姓名，先选择候选学生再定位。";
    }
  });

  savedExamSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchSavedExamStudent();
    }
  });
}

if (savedExamTableModal) {
  savedExamTableModal.addEventListener("click", (event) => {
    if (event.target === savedExamTableModal) {
      closeSavedExamTable();
    }
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
  renderSeatRuleSummary();
});

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
    renderSeatRuleSummary();
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
    renderConstraintLists();
    renderSeatRuleSummary();
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
    examTrendMode = ["all", "score", "rankClass", "rankSchool"].includes(event.target.value)
      ? event.target.value
      : "all";
    const student = state.students.find((item) => item.id === activeStudentId);
    if (student) {
      renderExamTrends(Array.isArray(student.exams) ? [...student.exams].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : []);
    }
  });
}
if (aiTrendBtn) {
  aiTrendBtn.addEventListener("click", generateAiTrendAdvice);
}
if (classAiTrendBtn) {
  classAiTrendBtn.addEventListener("click", generateClassAiTrendAdvice);
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
  if (!scoreExamName.value.trim()) {
    scoreExamName.value = mappingState.filename?.replace(/\.[^/.]+$/, "")?.trim() || "考试";
  }
  if (!scoreExamDate.value) {
    scoreExamDate.value = new Date().toISOString().slice(0, 10);
  }
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
    if (changePasswordModal && !changePasswordModal.classList.contains("hidden")) {
      closeChangePasswordModal();
    }
    if (shufflePreviewModal && !shufflePreviewModal.classList.contains("hidden")) {
      closeShufflePreview();
    }
    if (!mappingModal.classList.contains("hidden")) {
      closeMappingModal();
    }
    if (savedExamTableModal && !savedExamTableModal.classList.contains("hidden")) {
      closeSavedExamTable();
    }
    if (trendDetailModal && !trendDetailModal.classList.contains("hidden")) {
      closeTrendDetail();
    }
    if (!easterModal.classList.contains("hidden")) {
      closeEasterModal();
    }
  }
});

normalizeState();
registerOfflineApp();
initSeatCardMode();
initAnimatedDetails();
initSidebarNavigation();
renderAll();
if (isAuthenticated()) {
  showApp();
} else {
  showLogin();
}
