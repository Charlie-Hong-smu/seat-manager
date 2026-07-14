import {
  CHANNELS,
  channelDistribution,
  channelLabel,
  dashboardMetrics,
  effectiveStatus,
  expiryDistribution,
  filterAndSortLicenses,
  isAiValid,
  paginate,
  upcomingExpiries,
} from "./admin-model.js?v=20260713-2";

const state = {
  licenses: [],
  visiblePage: [],
  page: 1,
  filters: { query: "", status: "all", channel: "all", edition: "all", ai: "all", devices: "all", sort: "created-desc" },
  editorTrigger: null,
  confirmTrigger: null,
  pendingConfirm: null,
};

const $ = (id) => document.getElementById(id);
const fields = {
  workerUrl: $("workerUrl"), adminToken: $("adminToken"), licenseKey: $("licenseKey"), licenseId: $("licenseId"),
  productCode: $("productCode"), acquisitionChannel: $("acquisitionChannel"), acquisitionDetail: $("acquisitionDetail"),
  status: $("status"), allowedEditions: $("allowedEditions"), maxDevices: $("maxDevices"), expiresAt: $("expiresAt"),
  aiEnabled: $("aiEnabled"), aiExpiresAt: $("aiExpiresAt"), aiDailyLimit: $("aiDailyLimit"), clearDevices: $("clearDevices"),
};

fields.workerUrl.value = localStorage.getItem("seat-manager-license-admin-worker") || fields.workerUrl.value;
fields.adminToken.value = localStorage.getItem("seat-manager-license-admin-token") || "";
CHANNELS.filter((item) => item.value !== "unknown").forEach((item) => {
  fields.acquisitionChannel.add(new Option(item.label, item.value));
});
CHANNELS.forEach((item) => $("channelFilter").add(new Option(item.label, item.value)));

function baseUrl() { return fields.workerUrl.value.trim().replace(/\/+$/, ""); }

async function api(path, body = {}) {
  const token = fields.adminToken.value.trim();
  if (!token) throw new Error("请先输入管理员密钥");
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data.error, response.status));
  return data;
}

function errorMessage(error, status) {
  if (error === "unauthorized") return "管理员密钥无效";
  if (error === "bad_request") return "提交内容无效，请检查渠道、日期和授权信息";
  return error || `请求失败 ${status}`;
}

function setPageStatus(message, type = "") {
  $("pageStatus").textContent = message;
  $("pageStatus").className = `status ${type}`;
}

function setFormStatus(message, type = "") {
  $("formStatus").textContent = message;
  $("formStatus").className = `status wide ${type}`;
}

async function refreshLicenses() {
  setPageStatus("正在加载授权记录…");
  $("refreshBtn").disabled = true;
  try {
    const licenses = [];
    const seenCursors = new Set();
    let cursor = "";
    do {
      const data = await api("/admin/licenses/list", cursor ? { cursor } : {});
      const pageLicenses = await Promise.all((data.licenses || []).map(async (license) => ({
        ...license,
        productCode: await decryptProductCode(license.productCodeSecret),
      })));
      licenses.push(...pageLicenses);
      cursor = data.partial ? String(data.cursor || "") : "";
      if (cursor && seenCursors.has(cursor)) throw new Error("授权列表分页异常，请稍后重试");
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    state.licenses = licenses;
    state.page = 1;
    renderAll();
    setPageStatus("数据已刷新", "ok");
  } finally {
    $("refreshBtn").disabled = false;
  }
}

function renderAll() {
  renderMetrics();
  renderCharts();
  renderTable();
}

function renderMetrics() {
  const metrics = dashboardMetrics(state.licenses);
  $("metricTotal").textContent = metrics.total;
  $("metricUsable").textContent = metrics.usable;
  $("metricExpiring").textContent = metrics.expiring;
  $("metricAi").textContent = metrics.aiValid;
  $("metricDevices").textContent = `${metrics.devices} / ${metrics.deviceCapacity}`;
}

function renderCharts() {
  renderBars($("channelChart"), channelDistribution(state.licenses), "channel");
  renderExpiryPanel();
}

function renderExpiryPanel() {
  const distribution = expiryDistribution(state.licenses);
  const upcoming = upcomingExpiries(state.licenses);
  const max = Math.max(...distribution.map((item) => item.count), 1);
  const bars = distribution.length
    ? distribution.map((item) => barMarkup(item, max, "expiry")).join("")
    : '<div class="muted">暂无可统计的数据。</div>';
  const list = upcoming.length
    ? upcoming.map((item) => `<button class="expiry-item" type="button" data-expiring-license="${escapeHtml(item.licenseId)}"><span><strong>${escapeHtml(item.licenseId)}</strong><small>${formatDate(item.expiresAt)}</small></span><span class="expiry-days">剩 ${item.daysRemaining} 天</span></button>`).join("")
    : '<div class="muted">未来 30 天没有授权到期。</div>';
  $("expiryChart").innerHTML = `<div class="expiry-bars">${bars}</div><div class="expiry-list"><div class="expiry-list-title">未来 30 天即将到期</div>${list}</div>`;
}

function renderBars(container, items, kind) {
  if (!items.length) {
    container.innerHTML = '<div class="muted">暂无可统计的数据。</div>';
    return;
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  container.innerHTML = items.map((item) => barMarkup(item, max, kind)).join("");
}

function barMarkup(item, max, kind) {
  const width = Math.max(4, Math.round(item.count / max * 100));
  if (kind === "channel") {
    return `<button class="bar-button" type="button" data-channel="${escapeHtml(item.value)}"><span>${escapeHtml(item.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span><span class="bar-count">${item.count}</span></button>`;
  }
  return `<div class="bar-button"><span>${escapeHtml(item.label)}</span><span class="bar-track"><span class="bar-fill warning" style="width:${width}%"></span></span><span class="bar-count">${item.count}</span></div>`;
}

function renderTable() {
  const filtered = filterAndSortLicenses(state.licenses, state.filters);
  const result = paginate(filtered, state.page, 25);
  state.page = result.page;
  state.visiblePage = result.items;
  $("summaryText").textContent = `已筛选 ${filtered.length} / 共 ${state.licenses.length} 条`;
  $("pageInfo").textContent = `第 ${result.page} / ${result.totalPages} 页`;
  $("prevPageBtn").disabled = result.page <= 1;
  $("nextPageBtn").disabled = result.page >= result.totalPages;
  const tbody = $("licenseRows");
  if (!result.items.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">没有符合当前条件的授权记录。</td></tr>';
    return;
  }
  tbody.innerHTML = result.items.map((license, index) => {
    const status = effectiveStatus(license);
    const channel = license.acquisitionChannel || "unknown";
    return `<tr>
      <td><div class="primary-text">${escapeHtml(license.licenseId)}</div><div class="muted mono">${escapeHtml((license.codeHash || "").slice(0, 12))}…</div><div class="muted">创建：${formatDateTime(license.createdAt)}</div></td>
      <td><span class="pill ${status}">${statusLabel(status)}</span></td>
      <td><span class="pill ${channel === "unknown" ? "unknown" : ""}">${escapeHtml(channelLabel(channel))}</span>${license.acquisitionDetail ? `<div class="muted">${escapeHtml(license.acquisitionDetail)}</div>` : ""}</td>
      <td>${formatAllowedEditions(license.allowedEditions)}</td>
      <td>${formatDate(license.expiresAt)}</td>
      <td>${license.aiEnabled ? (isAiValid(license) ? "当前有效" : "已到期") : "未开通"}<div class="muted">到期：${formatDate(license.aiExpiresAt)} / 日限 ${Number(license.aiDailyLimit || 0)}</div></td>
      <td>${Number(license.deviceCount || 0)}/${Number(license.maxDevices || 0)}<div class="muted">${(license.devices || []).map((item) => escapeHtml(item.name)).join("、") || "无设备"}</div></td>
      <td><div class="button-row"><button class="button ghost small" type="button" data-action="edit" data-index="${index}">编辑</button><button class="button secondary small" type="button" data-action="clear" data-index="${index}">清设备</button><button class="button danger small" type="button" data-action="delete" data-index="${index}">删除</button></div></td>
    </tr>`;
  }).join("");
}

function resetForm() {
  fields.licenseKey.value = "";
  fields.licenseId.value = "";
  fields.productCode.value = "";
  fields.acquisitionChannel.value = "";
  fields.acquisitionDetail.value = "";
  fields.status.value = "active";
  fields.allowedEditions.value = "commercial";
  fields.maxDevices.value = "3";
  fields.expiresAt.value = "";
  fields.aiEnabled.checked = true;
  fields.aiExpiresAt.value = "";
  fields.aiDailyLimit.value = "30";
  fields.clearDevices.checked = false;
  $("newCodeBox").hidden = true;
  $("newCodeBox").textContent = "";
  $("editorTitle").textContent = "新建授权";
  $("editorSubtitle").textContent = "填写授权与渠道信息";
  setFormStatus("");
}

function openNewEditor(trigger) {
  resetForm();
  openEditor(trigger);
}

function editLicense(license, trigger) {
  resetForm();
  fields.licenseKey.value = license.licenseKey;
  fields.licenseId.value = license.licenseId;
  fields.productCode.value = license.productCode || "";
  fields.acquisitionChannel.value = license.acquisitionChannel === "unknown" ? "" : license.acquisitionChannel;
  fields.acquisitionDetail.value = license.acquisitionDetail || "";
  fields.status.value = license.status;
  fields.allowedEditions.value = [...(license.allowedEditions || ["commercial"])].sort().join(",") === "commercial,zhang" ? "zhang,commercial" : (license.allowedEditions || ["commercial"]).join(",");
  fields.maxDevices.value = license.maxDevices;
  fields.expiresAt.value = isoToDate(license.expiresAt);
  fields.aiEnabled.checked = Boolean(license.aiEnabled);
  fields.aiExpiresAt.value = isoToDate(license.aiExpiresAt);
  fields.aiDailyLimit.value = license.aiDailyLimit;
  $("editorTitle").textContent = `编辑 ${license.licenseId}`;
  $("editorSubtitle").textContent = license.createdAt ? `创建于 ${formatDateTime(license.createdAt)}` : "历史记录未保存创建时间";
  if (license.acquisitionChannel === "unknown") setFormStatus("这条历史记录需要补充获客渠道后才能保存。", "error");
  openEditor(trigger);
}

function openEditor(trigger) {
  state.editorTrigger = trigger || document.activeElement;
  const overlay = $("editorOverlay");
  overlay.hidden = false;
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("open"));
  queueMicrotask(() => fields.licenseId.focus());
}

function closeEditor() {
  const overlay = $("editorOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  overlay.hidden = true;
  state.editorTrigger?.focus?.();
}

function requestConfirmation({ title, message, actionLabel, trigger, action }) {
  state.confirmTrigger = trigger || document.activeElement;
  state.pendingConfirm = action;
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmActionBtn").textContent = actionLabel;
  const overlay = $("confirmOverlay");
  if ($("editorOverlay").classList.contains("open")) $("editorOverlay").setAttribute("inert", "");
  overlay.hidden = false;
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("open"));
  $("confirmCancelBtn").focus();
}

function closeConfirmation() {
  const overlay = $("confirmOverlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  overlay.hidden = true;
  if ($("editorOverlay").classList.contains("open")) $("editorOverlay").removeAttribute("inert");
  state.pendingConfirm = null;
  state.confirmTrigger?.focus?.();
}

function setFilter(name, value) {
  state.filters[name] = value;
  state.page = 1;
  const input = filterElement(name);
  if (input) input.value = value;
  renderTable();
}

function filterElement(name) {
  return ({ status: $("statusFilter"), channel: $("channelFilter"), edition: $("editionFilter"), ai: $("aiFilter"), devices: $("deviceFilter"), sort: $("sortFilter") })[name];
}

$("refreshBtn").addEventListener("click", () => refreshLicenses().catch((error) => setPageStatus(error.message, "error")));
$("newLicenseBtn").addEventListener("click", (event) => openNewEditor(event.currentTarget));
$("closeEditorBtn").addEventListener("click", closeEditor);
$("cancelEditorBtn").addEventListener("click", closeEditor);
$("resetFormBtn").addEventListener("click", resetForm);
$("saveTokenBtn").addEventListener("click", () => {
  localStorage.setItem("seat-manager-license-admin-worker", fields.workerUrl.value.trim());
  localStorage.setItem("seat-manager-license-admin-token", fields.adminToken.value.trim());
  setPageStatus("连接设置已保存在当前浏览器", "ok");
});
$("forgetTokenBtn").addEventListener("click", () => {
  localStorage.removeItem("seat-manager-license-admin-token");
  fields.adminToken.value = "";
  setPageStatus("已清除本机管理员密钥", "ok");
});

$("generateCodeBtn").addEventListener("click", () => {
  const code = randomCode();
  fields.productCode.value = code;
  $("newCodeBox").textContent = `新授权码：${code}。保存后会加密记录，可使用同一个管理员密钥再次查看。`;
  $("newCodeBox").hidden = false;
});
$("copyCodeBtn").addEventListener("click", async () => {
  if (!fields.productCode.value.trim()) return setFormStatus("当前没有可复制的授权码", "error");
  await navigator.clipboard.writeText(fields.productCode.value.trim());
  setFormStatus("授权码已复制", "ok");
});

$("licenseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const channel = fields.acquisitionChannel.value;
  if (!channel) return setFormStatus("请选择获客渠道", "error");
  if (channel === "other" && !fields.acquisitionDetail.value.trim()) return setFormStatus("选择其他渠道时必须填写来源明细", "error");
  if (!fields.licenseKey.value && !fields.productCode.value.trim()) return setFormStatus("新建授权时必须填写或生成授权码", "error");
  const saveButton = $("saveLicenseBtn");
  saveButton.disabled = true;
  setFormStatus("正在保存…");
  try {
    await api("/admin/licenses/upsert", {
      licenseKey: fields.licenseKey.value,
      licenseId: fields.licenseId.value.trim(),
      productCode: fields.productCode.value.trim(),
      productCodeSecret: await encryptProductCode(fields.productCode.value),
      acquisitionChannel: channel,
      acquisitionDetail: fields.acquisitionDetail.value.trim(),
      status: fields.status.value,
      allowedEditions: fields.allowedEditions.value.split(",").filter(Boolean),
      expiresAt: dateToIsoEnd(fields.expiresAt.value),
      maxDevices: Number(fields.maxDevices.value),
      aiEnabled: fields.aiEnabled.checked,
      aiExpiresAt: dateToIsoEnd(fields.aiExpiresAt.value),
      aiDailyLimit: Number(fields.aiDailyLimit.value),
      clearDevices: fields.clearDevices.checked,
    });
    await refreshLicenses();
    closeEditor();
    setPageStatus("授权已保存", "ok");
  } catch (error) {
    setFormStatus(error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});

$("licenseRows").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const license = state.visiblePage[Number(button.dataset.index)];
  if (!license) return;
  if (button.dataset.action === "edit") return editLicense(license, button);
  if (button.dataset.action === "clear") {
    requestConfirmation({
      title: "清空设备绑定", actionLabel: "确认清空", trigger: button,
      message: `将清空 ${license.licenseId} 的全部设备绑定，用户需要重新登录。授权和云端备份不会被删除。`,
      action: async () => { await api("/admin/licenses/clear-devices", { licenseKey: license.licenseKey }); await refreshLicenses(); setPageStatus("设备绑定已清空", "ok"); },
    });
  }
  if (button.dataset.action === "delete") {
    requestConfirmation({
      title: "删除授权记录", actionLabel: "确认删除", trigger: button,
      message: `将永久删除 ${license.licenseId} 的授权记录，用户将无法继续使用此授权码。云端备份不会一并删除。`,
      action: async () => { await api("/admin/licenses/delete", { licenseKey: license.licenseKey, licenseId: license.licenseId }); await refreshLicenses(); setPageStatus("授权记录已删除", "ok"); },
    });
  }
});

$("confirmCancelBtn").addEventListener("click", closeConfirmation);
$("confirmActionBtn").addEventListener("click", async () => {
  const action = state.pendingConfirm;
  if (!action) return;
  $("confirmActionBtn").disabled = true;
  try { await action(); closeConfirmation(); }
  catch (error) { closeConfirmation(); setPageStatus(error.message, "error"); }
  finally { $("confirmActionBtn").disabled = false; }
});

$("channelChart").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-channel]");
  if (button) setFilter("channel", button.dataset.channel);
});
$("expiryChart").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-expiring-license]");
  if (!button) return;
  state.filters.query = button.dataset.expiringLicense;
  state.filters.status = "expiring";
  state.page = 1;
  $("searchInput").value = button.dataset.expiringLicense;
  $("statusFilter").value = "expiring";
  renderTable();
  $("licenseRows").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelectorAll("[data-metric-filter]").forEach((button) => button.addEventListener("click", () => {
  const filter = button.dataset.metricFilter;
  if (filter === "all") {
    state.filters = { ...state.filters, query: "", status: "all", channel: "all", edition: "all", ai: "all", devices: "all" };
    $("searchInput").value = "";
    [["status", "all"], ["channel", "all"], ["edition", "all"], ["ai", "all"], ["devices", "all"]].forEach(([name, value]) => { filterElement(name).value = value; });
    state.page = 1;
    renderTable();
  }
  if (["usable", "expiring"].includes(filter)) setFilter("status", filter);
  if (filter === "ai") setFilter("ai", "valid");
  if (filter === "devices") setFilter("devices", "used");
}));

$("searchInput").addEventListener("input", (event) => { state.filters.query = event.target.value; state.page = 1; renderTable(); });
[["statusFilter", "status"], ["channelFilter", "channel"], ["editionFilter", "edition"], ["aiFilter", "ai"], ["deviceFilter", "devices"], ["sortFilter", "sort"]]
  .forEach(([id, name]) => $(id).addEventListener("change", (event) => setFilter(name, event.target.value)));
$("prevPageBtn").addEventListener("click", () => { state.page -= 1; renderTable(); });
$("nextPageBtn").addEventListener("click", () => { state.page += 1; renderTable(); });

document.addEventListener("keydown", (event) => {
  const activeOverlay = $("confirmOverlay").classList.contains("open") ? $("confirmOverlay") : $("editorOverlay").classList.contains("open") ? $("editorOverlay") : null;
  if (!activeOverlay) return;
  if (event.key === "Escape") {
    if (activeOverlay.id === "confirmOverlay") closeConfirmation(); else closeEditor();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...activeOverlay.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function dateToIsoEnd(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T23:59:59.999+08:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
function isoToDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDate(value) { return value ? isoToDate(value) : "永久"; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value)) : "未知"; }
function statusLabel(status) { return ({ usable: "当前可用", expired: "已到期", disabled: "已停用" })[status] || status; }
function formatAllowedEditions(value) {
  const editions = Array.isArray(value) ? value : ["commercial"];
  if (editions.includes("zhang") && editions.includes("commercial")) return "两版通用";
  return editions.includes("zhang") ? "小张版" : "商用版";
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `SM-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}
function bytesToBase64(bytes) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function getProductCodeCryptoKey() {
  const token = fields.adminToken.value.trim();
  if (!token) throw new Error("请先输入管理员密钥");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seat-manager-license-admin:${token}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptProductCode(productCode) {
  const text = productCode.trim();
  if (!text) return "";
  const key = await getProductCodeCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}
async function decryptProductCode(secret) {
  if (!secret) return "";
  try {
    const payload = JSON.parse(secret);
    const key = await getProductCodeCryptoKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
    return new TextDecoder().decode(decrypted);
  } catch { return ""; }
}

renderAll();
if (fields.adminToken.value) refreshLicenses().catch((error) => setPageStatus(error.message, "error"));
