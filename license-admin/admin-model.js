export const CHANNELS = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "wechat", label: "微信" },
  { value: "douyin", label: "抖音" },
  { value: "referral", label: "转介绍" },
  { value: "offline", label: "线下" },
  { value: "other", label: "其他" },
  { value: "unknown", label: "待补充" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function channelLabel(value) {
  return CHANNELS.find((item) => item.value === value)?.label || "待补充";
}

export function effectiveStatus(license, now = new Date()) {
  if (license.status !== "active") return "disabled";
  const expiry = timestamp(license.expiresAt);
  if (expiry && expiry <= now.getTime()) return "expired";
  return "usable";
}

export function isAiValid(license, now = new Date()) {
  if (!license.aiEnabled || effectiveStatus(license, now) !== "usable") return false;
  const expiry = timestamp(license.aiExpiresAt);
  return !expiry || expiry > now.getTime();
}

export function isExpiringWithin(license, days, now = new Date()) {
  if (effectiveStatus(license, now) !== "usable") return false;
  const expiry = timestamp(license.expiresAt);
  return Boolean(expiry && expiry <= now.getTime() + days * DAY_MS);
}

export function dashboardMetrics(licenses, now = new Date()) {
  return {
    total: licenses.length,
    usable: licenses.filter((item) => effectiveStatus(item, now) === "usable").length,
    expiring: licenses.filter((item) => isExpiringWithin(item, 30, now)).length,
    aiValid: licenses.filter((item) => isAiValid(item, now)).length,
    devices: licenses.reduce((sum, item) => sum + Number(item.deviceCount || 0), 0),
    deviceCapacity: licenses.reduce((sum, item) => sum + Number(item.maxDevices || 0), 0),
  };
}

export function channelDistribution(licenses) {
  const counts = new Map(CHANNELS.map((item) => [item.value, 0]));
  licenses.forEach((license) => {
    const channel = counts.has(license.acquisitionChannel) ? license.acquisitionChannel : "unknown";
    counts.set(channel, counts.get(channel) + 1);
  });
  return CHANNELS
    .map((item) => ({ ...item, count: counts.get(item.value) || 0 }))
    .filter((item) => item.count > 0);
}

export function expiryDistribution(licenses, now = new Date()) {
  const buckets = [
    { value: "expired", label: "已到期", count: 0 },
    { value: "within7", label: "7 天内", count: 0 },
    { value: "within30", label: "8–30 天", count: 0 },
    { value: "later", label: "30 天以上", count: 0 },
    { value: "permanent", label: "永久", count: 0 },
    { value: "disabled", label: "已停用", count: 0 },
  ];
  const byValue = new Map(buckets.map((item) => [item.value, item]));
  licenses.forEach((license) => {
    const status = effectiveStatus(license, now);
    if (status === "disabled" || status === "expired") {
      byValue.get(status).count += 1;
      return;
    }
    const expiry = timestamp(license.expiresAt);
    if (!expiry) byValue.get("permanent").count += 1;
    else if (expiry <= now.getTime() + 7 * DAY_MS) byValue.get("within7").count += 1;
    else if (expiry <= now.getTime() + 30 * DAY_MS) byValue.get("within30").count += 1;
    else byValue.get("later").count += 1;
  });
  return buckets.filter((item) => item.count > 0);
}

export function upcomingExpiries(licenses, now = new Date(), days = 30) {
  return licenses
    .filter((license) => isExpiringWithin(license, days, now))
    .map((license) => ({
      licenseId: license.licenseId,
      expiresAt: license.expiresAt,
      daysRemaining: Math.max(1, Math.ceil((timestamp(license.expiresAt) - now.getTime()) / DAY_MS)),
    }))
    .sort((a, b) => timestamp(a.expiresAt) - timestamp(b.expiresAt)
      || String(a.licenseId).localeCompare(String(b.licenseId), "zh-CN"));
}

export function filterAndSortLicenses(licenses, filters = {}, now = new Date()) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("zh-CN");
  const filtered = licenses.filter((license) => {
    const searchable = [license.licenseId, license.productCode, license.acquisitionDetail]
      .map((value) => String(value || "").toLocaleLowerCase("zh-CN"));
    if (query && !searchable.some((value) => value.includes(query))) return false;
    if (filters.channel && filters.channel !== "all" && license.acquisitionChannel !== filters.channel) return false;
    if (filters.edition && filters.edition !== "all" && !(license.allowedEditions || []).includes(filters.edition)) return false;
    if (filters.ai === "valid" && !isAiValid(license, now)) return false;
    if (filters.ai === "disabled" && license.aiEnabled) return false;
    const count = Number(license.deviceCount || 0);
    const capacity = Number(license.maxDevices || 0);
    if (filters.devices === "none" && count !== 0) return false;
    if (filters.devices === "used" && count === 0) return false;
    if (filters.devices === "full" && (capacity <= 0 || count < capacity)) return false;
    const status = effectiveStatus(license, now);
    if (filters.status === "expiring" && !isExpiringWithin(license, 30, now)) return false;
    if (filters.status && !["all", "expiring"].includes(filters.status) && status !== filters.status) return false;
    return true;
  });

  return filtered.sort(sorter(filters.sort || "created-desc"));
}

export function paginate(items, page = 1, pageSize = 25) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, totalPages };
}

function sorter(sort) {
  const text = (value) => String(value || "");
  const dateValue = (value, fallback) => timestamp(value) || fallback;
  if (sort === "expiry-asc") {
    return (a, b) => dateValue(a.expiresAt, Number.MAX_SAFE_INTEGER) - dateValue(b.expiresAt, Number.MAX_SAFE_INTEGER);
  }
  if (sort === "license-asc") return (a, b) => text(a.licenseId).localeCompare(text(b.licenseId), "zh-CN");
  if (sort === "devices-desc") {
    return (a, b) => Number(b.deviceCount || 0) - Number(a.deviceCount || 0)
      || text(a.licenseId).localeCompare(text(b.licenseId), "zh-CN");
  }
  return (a, b) => dateValue(b.createdAt, 0) - dateValue(a.createdAt, 0)
    || text(a.licenseId).localeCompare(text(b.licenseId), "zh-CN");
}

function timestamp(value) {
  const result = Date.parse(String(value || ""));
  return Number.isFinite(result) ? result : 0;
}
