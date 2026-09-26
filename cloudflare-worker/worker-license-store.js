import { sha256Hex, timingSafeEqual } from "./worker-auth.js";
import { toText } from "./worker-input.js";
import { LICENSE_KEY_PREFIX, LICENSE_SYNC_STATE_SUFFIX, getLicenseKey, sanitizeLicenseId } from "./worker-license-keys.js";

export const DEFAULT_MAX_DEVICES = 3;

export const DEFAULT_AI_DAILY_LIMIT = 30;

const DEFAULT_ALLOWED_EDITIONS = Object.freeze(["commercial"]);

export async function loadLicenseRecord(codeHash, env) {
  if (env.SEAT_MANAGER_KV) {
    const key = getLicenseKey(codeHash);
    const license = await loadLicenseRecordByKey(key, env);
    if (license) {
      return license;
    }
  }

  let allowed = false;
  if (env.PRODUCT_ACCESS_CODE_HASH) {
    allowed = timingSafeEqual(codeHash, env.PRODUCT_ACCESS_CODE_HASH);
  } else if (env.PRODUCT_ACCESS_CODE) {
    allowed = timingSafeEqual(codeHash, await sha256Hex(env.PRODUCT_ACCESS_CODE));
  }
  if (!allowed) {
    return null;
  }

  return {
    storageKey: getLicenseKey(codeHash),
    legacyEnv: true,
    licenseId: sanitizeLicenseId(env.PRODUCT_LICENSE_ID || "single"),
    allowedEditions: DEFAULT_ALLOWED_EDITIONS,
    status: "active",
    expiresAt: "",
    maxDevices: normalizeMaxDevices(env.PRODUCT_MAX_DEVICES),
    aiEnabled: parseBoolean(env.PRODUCT_AI_ENABLED, false),
    aiExpiresAt: toText(env.PRODUCT_AI_EXPIRES_AT || ""),
    aiDailyLimit: normalizeAiDailyLimit(env.PRODUCT_AI_DAILY_LIMIT),
    productCodeSecret: "",
    devices: [],
  };
}

export async function loadLicenseRecordByKey(key, env) {
  if (!env.SEAT_MANAGER_KV || !toText(key).startsWith(LICENSE_KEY_PREFIX)) {
    return null;
  }
  const record = env.ACCOUNT_COORDINATOR ? await env.ACCOUNT_COORDINATOR.getByName(key).readLicense(key) : await env.SEAT_MANAGER_KV.get(key, { type: "json" });
  if (!record) {
    return null;
  }
  const licenseId = sanitizeLicenseId(record.licenseId || record.id);
  if (!licenseId) {
    return null;
  }
  return {
    storageKey: key,
    legacyEnv: false,
    licenseId,
    acquisitionChannel: normalizeAcquisitionChannel(record.acquisitionChannel, licenseId),
    acquisitionDetail: normalizeAcquisitionDetail(record.acquisitionDetail),
    allowedEditions: normalizeAllowedEditions(record.allowedEditions),
    status: toText(record.status || "active") || "active",
    expiresAt: toText(record.expiresAt || ""),
    maxDevices: normalizeMaxDevices(record.maxDevices),
    aiEnabled: parseBoolean(record.aiEnabled, false),
    aiExpiresAt: toText(record.aiExpiresAt || ""),
    aiDailyLimit: normalizeAiDailyLimit(record.aiDailyLimit),
    productCodeSecret: normalizeProductCodeSecret(record.productCodeSecret),
    devices: normalizeLicenseDevices(record.devices),
    createdAt: normalizeIsoTimestamp(record.createdAt),
    updatedAt: normalizeIsoTimestamp(record.updatedAt),
  };
}

export async function bindLicenseDevice(license, deviceId, deviceName, env, edition) {
  if (env.ACCOUNT_COORDINATOR && license.storageKey) {
    const result = await env.ACCOUNT_COORDINATOR.getByName(license.storageKey).mutateLicense(license.storageKey, { type: "bind", deviceId, deviceName, edition, maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES });
    if (result.ok) Object.assign(license, result.license);
    return result;
  }
  const maxDevices = license.maxDevices || DEFAULT_MAX_DEVICES;
  const now = new Date().toISOString();
  const devices = [...license.devices];
  const existingIndex = devices.findIndex((device) => device.id === deviceId);
  if (existingIndex >= 0) {
    devices[existingIndex] = {
      ...devices[existingIndex],
      name: deviceName,
      lastSeenAt: now,
    };
  } else {
    if (devices.length >= maxDevices) {
      return { ok: false, maxDevices };
    }
    devices.push({ id: deviceId, name: deviceName, firstSeenAt: now, lastSeenAt: now });
  }

  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { maxDevices, devices, updatedAt: now });
  }
  return { ok: true, maxDevices };
}

export async function unbindLicenseDevice(license, deviceId, env) {
  if (env.ACCOUNT_COORDINATOR && license.storageKey) return (await env.ACCOUNT_COORDINATOR.getByName(license.storageKey).mutateLicense(license.storageKey, { type: "unbind", deviceId })).removed;
  const now = new Date().toISOString();
  const devices = license.devices.filter((device) => device.id !== deviceId);
  const removed = devices.length !== license.devices.length;
  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { devices, updatedAt: now });
  }
  return removed;
}

export async function unbindAllLicenseDevices(license, env) {
  if (env.ACCOUNT_COORDINATOR && license.storageKey) { await env.ACCOUNT_COORDINATOR.getByName(license.storageKey).mutateLicense(license.storageKey, { type: "clear" }); return; }
  const now = new Date().toISOString();
  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { devices: [], updatedAt: now });
  }
}

export async function getAdminLicenseKey(input) {
  const existingKey = getAdminLicenseKeyFromExisting(input);
  if (existingKey) {
    return existingKey;
  }
  const productCode = toText(input?.productCode).trim();
  if (!productCode) {
    return "";
  }
  return getLicenseKey(await sha256Hex(productCode));
}

export function getAdminLicenseKeyFromExisting(input) {
  const key = toText(input?.licenseKey).trim();
  return key.startsWith(LICENSE_KEY_PREFIX) && !key.endsWith(LICENSE_SYNC_STATE_SUFFIX) ? key : "";
}

export function normalizeAdminLicenseInput(input, existing, fallback) {
  return {
    licenseId: fallback.licenseId,
    acquisitionChannel: fallback.acquisitionChannel,
    acquisitionDetail: fallback.acquisitionDetail,
    allowedEditions: normalizeAllowedEditions(input.allowedEditions ?? existing?.allowedEditions),
    status: ["active", "disabled"].includes(input.status) ? input.status : existing?.status || "active",
    expiresAt: normalizeIsoDateInput(input.expiresAt),
    maxDevices: normalizeMaxDevices(input.maxDevices ?? existing?.maxDevices),
    aiEnabled: parseBoolean(input.aiEnabled, Boolean(existing?.aiEnabled)),
    aiExpiresAt: normalizeIsoDateInput(input.aiExpiresAt),
    aiDailyLimit: normalizeAiDailyLimit(input.aiDailyLimit ?? existing?.aiDailyLimit),
    productCodeSecret: normalizeProductCodeSecret(input.productCodeSecret) || existing?.productCodeSecret || "",
    devices: fallback.devices,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt,
  };
}

const ACQUISITION_CHANNELS = new Set([
  "xiaohongshu",
  "wechat",
  "douyin",
  "referral",
  "offline",
  "other",
  "unknown",
]);

export function normalizeAdminAcquisitionInput(input, existing, licenseId) {
  const hasChannel = Object.prototype.hasOwnProperty.call(input, "acquisitionChannel");
  const requested = toText(input.acquisitionChannel).trim();
  const channel = hasChannel
    ? requested
    : existing?.acquisitionChannel || normalizeAcquisitionChannel("", licenseId);
  const detail = Object.prototype.hasOwnProperty.call(input, "acquisitionDetail")
    ? normalizeAcquisitionDetail(input.acquisitionDetail)
    : existing?.acquisitionDetail || "";
  const isNewUnknown = !existing && channel === "unknown";
  const invalidDetail = toText(input.acquisitionDetail).trim().length > 120;
  if (!ACQUISITION_CHANNELS.has(channel) || isNewUnknown || invalidDetail || (channel === "other" && !detail)) {
    return { ok: false, channel: "unknown", detail: "" };
  }
  return { ok: true, channel, detail };
}

function normalizeAcquisitionChannel(value, licenseId = "") {
  const channel = toText(value).trim();
  if (ACQUISITION_CHANNELS.has(channel)) {
    return channel;
  }
  return /^xhs-/i.test(toText(licenseId).trim()) ? "xiaohongshu" : "unknown";
}

function normalizeAcquisitionDetail(value) {
  return toText(value).trim().slice(0, 120);
}

function normalizeIsoTimestamp(value) {
  const text = toText(value).trim();
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
}

export function serializeLicenseForStorage(license, overrides = {}) {
  const value = { ...license, ...overrides };
  return {
    licenseId: value.licenseId,
    acquisitionChannel: normalizeAcquisitionChannel(value.acquisitionChannel, value.licenseId),
    acquisitionDetail: normalizeAcquisitionDetail(value.acquisitionDetail),
    allowedEditions: normalizeAllowedEditions(value.allowedEditions),
    status: value.status,
    expiresAt: value.expiresAt || "",
    maxDevices: value.maxDevices || DEFAULT_MAX_DEVICES,
    aiEnabled: Boolean(value.aiEnabled),
    aiExpiresAt: value.aiExpiresAt || "",
    aiDailyLimit: value.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
    productCodeSecret: value.productCodeSecret || "",
    devices: normalizeLicenseDevices(value.devices),
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
  };
}

async function persistLicenseRecord(license, env, overrides = {}) {
  await env.SEAT_MANAGER_KV.put(
    license.storageKey,
    JSON.stringify(serializeLicenseForStorage(license, overrides)),
  );
}

export function serializeLicenseForAdmin(license) {
  if (!license) {
    return null;
  }
  return {
    licenseKey: license.storageKey,
    codeHash: license.storageKey.replace(LICENSE_KEY_PREFIX, ""),
    licenseId: license.licenseId,
    acquisitionChannel: license.acquisitionChannel,
    acquisitionDetail: license.acquisitionDetail,
    allowedEditions: license.allowedEditions,
    status: license.status,
    expiresAt: license.expiresAt || "",
    maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES,
    aiEnabled: Boolean(license.aiEnabled),
    aiExpiresAt: license.aiExpiresAt || "",
    aiDailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
    productCodeSecret: license.productCodeSecret || "",
    deviceCount: license.devices.length,
    devices: license.devices,
    createdAt: license.createdAt || "",
    updatedAt: license.updatedAt || "",
  };
}

function normalizeProductCodeSecret(value) {
  const secret = toText(value).trim();
  if (!secret || secret.length > 1000) {
    return "";
  }
  return secret;
}

export function normalizeEdition(value) {
  const edition = toText(value).trim();
  return edition === "zhang" || edition === "commercial" ? edition : "";
}

function normalizeAllowedEditions(value) {
  const values = Array.isArray(value) ? value : DEFAULT_ALLOWED_EDITIONS;
  const normalized = [...new Set(values.map(normalizeEdition).filter(Boolean))];
  return normalized.length ? normalized : [...DEFAULT_ALLOWED_EDITIONS];
}

function normalizeIsoDateInput(value) {
  const text = toText(value).trim();
  if (!text) {
    return "";
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function normalizeMaxDevices(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_DEVICES;
  }
  return Math.max(1, Math.min(10, Math.trunc(number)));
}

function normalizeAiDailyLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_AI_DAILY_LIMIT;
  }
  return Math.max(1, Math.min(500, Math.trunc(number)));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = toText(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeLicenseDevices(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((device) => {
      if (!device || typeof device !== "object") {
        return null;
      }
      const id = toText(device.id).slice(0, 120);
      if (!id) {
        return null;
      }
      return {
        id,
        name: toText(device.name || "").slice(0, 80) || "未知设备",
        firstSeenAt: toText(device.firstSeenAt || ""),
        lastSeenAt: toText(device.lastSeenAt || ""),
      };
    })
    .filter(Boolean);
}
