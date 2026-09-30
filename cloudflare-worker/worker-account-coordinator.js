import { DurableObject } from "cloudflare:workers";
import { hasConflictingLicenseId } from "./worker-license-identity.js";
import { sanitizeLicenseId } from "./worker-license-keys.js";

const TTL_SECONDS = 3 * 24 * 60 * 60;

/** One object per quota day/actor or license key. KV remains a compatibility mirror. */
export class AccountCoordinator extends DurableObject {
  pending = Promise.resolve();

  enqueue(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async load(key) {
    const stored = await this.ctx.storage.get("record");
    if (stored) return stored.value;
    const value = await this.env.SEAT_MANAGER_KV.get(key, { type: "json" });
    await this.ctx.storage.put("record", { value });
    return value;
  }

  readLicense(key) {
    return this.enqueue(() => this.load(key));
  }

  readLicenseIdentity(key) {
    return this.enqueue(async () => {
      const current = await this.load(key);
      return sanitizeLicenseId(current?.licenseId || current?.id) || await this.ctx.storage.get("licenseId") || "";
    });
  }

  claimLicenseId(licenseId, licenseKey) {
    return this.enqueue(async () => {
      const owner = await this.ctx.storage.get("owner");
      if (owner) return owner === licenseKey;
      if (await hasConflictingLicenseId(licenseId, licenseKey, this.env.SEAT_MANAGER_KV)) return false;
      // Retained after deletion: a cloud space can never be reassigned.
      await this.ctx.storage.put("owner", licenseKey);
      return true;
    });
  }

  mutateLicense(key, operation) {
    return this.enqueue(async () => {
      if (operation.type === "delete") {
        // Retain a tombstone so a later read cannot rehydrate a stale KV mirror.
        const current = await this.load(key);
        const licenseId = sanitizeLicenseId(current?.licenseId || current?.id);
        await this.ctx.storage.put({ record: { value: null }, ...(licenseId ? { licenseId } : {}) });
        await this.env.SEAT_MANAGER_KV.delete(key);
        return { ok: true, license: null };
      }
      let current = await this.load(key);
      if (!current && operation.type === "bind" && operation.initialRecord && !await this.ctx.storage.get("licenseId")) current = operation.initialRecord;
      const now = new Date().toISOString();
      let next;
      let removed = false;
      if (operation.type === "upsert") {
        const licenseId = sanitizeLicenseId(current?.licenseId || current?.id) || await this.ctx.storage.get("licenseId");
        if (licenseId && licenseId !== operation.record.licenseId) return { ok: false, error: "license_id_immutable" };
        const devices = operation.clearDevices ? [] : current?.devices || [];
        next = { ...current, ...operation.record, revoked: false, devices: operation.record.status === "disabled" && current?.status !== "disabled" ? devices.map(device => ({ ...device, sessionId: crypto.randomUUID() })) : devices, createdAt: current?.createdAt || operation.record.createdAt, updatedAt: now };
      } else {
        if (!current || current.revoked) return { ok: false, error: "license_missing" };
        const devices = Array.isArray(current.devices) ? [...current.devices] : [];
        const configuredLimit = Number(current.maxDevices);
        const maxDevices = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.max(1, Math.min(10, Math.trunc(configuredLimit))) : operation.maxDevices;
        if (operation.type === "bind") {
          if ((current.status || "active") !== "active") return { ok: false, error: "license_inactive" };
          if (current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) return { ok: false, error: "license_expired" };
          if (!(current.allowedEditions || ["commercial"]).includes(operation.edition)) return { ok: false, error: "edition_forbidden" };
          const index = devices.findIndex(device => device.id === operation.deviceId);
          if (index < 0 && devices.length >= maxDevices) return { ok: false, maxDevices };
          if (index >= 0) devices[index] = { ...devices[index], sessionId: devices[index].sessionId || crypto.randomUUID(), name: operation.deviceName, lastSeenAt: now };
          else devices.push({ id: operation.deviceId, sessionId: crypto.randomUUID(), name: operation.deviceName, firstSeenAt: now, lastSeenAt: now });
          next = { ...current, devices, maxDevices, updatedAt: now };
        } else if (operation.type === "unbind" || operation.type === "clear") {
          if (operation.type === "unbind" && (devices.find(device => device.id === operation.deviceId)?.sessionId || "") !== operation.expectedSessionId) return { ok: true, removed: false, license: current };
          const kept = operation.type === "clear" ? [] : devices.filter(device => device.id !== operation.deviceId);
          removed = kept.length !== devices.length;
          next = { ...current, devices: kept, updatedAt: now };
        } else throw new Error("invalid_license_operation");
      }
      await this.ctx.storage.put("record", { value: next });
      await this.env.SEAT_MANAGER_KV.put(key, JSON.stringify(next));
      return { ok: true, maxDevices: next.maxDevices, removed, license: next };
    });
  }

  consumeUsage(key, dailyLimit, timestamp) {
    return this.enqueue(async () => {
      const stored = await this.load(key);
      const count = Math.max(0, Math.floor(Number(stored?.count) || 0));
      if (count >= dailyLimit) return { allowed: false, reason: "daily" };
      const value = { count: count + 1, updatedAt: timestamp };
      await this.ctx.storage.put("record", { value });
      await this.ctx.storage.setAlarm(Date.now() + TTL_SECONDS * 1000);
      try {
        await this.env.SEAT_MANAGER_KV.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS });
      } catch { console.warn(JSON.stringify({ event: "ai_usage_mirror_failed" })); }
      return { allowed: true, reason: "counted", count: value.count };
    });
  }

  async alarm() {
    await this.enqueue(() => this.ctx.storage.deleteAll());
  }
}
