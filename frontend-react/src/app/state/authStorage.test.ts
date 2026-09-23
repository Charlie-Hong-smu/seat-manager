import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorizeProduct, clearAuth, enterLocalPreviewSession, getProductAuth, getProductAuthToken, isAuthenticated, unbindCurrentDevice } from "./authStorage";
import { fetchCloudStatus } from "./syncStorage";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 8, 22);

describe("product login persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockAuth(expiresAt: number) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "test-product-token", expiresAt }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("requests 90 days and restores remembered login after a new session until the exact expiry", async () => {
    const expiresAt = START + 90 * DAY;
    const fetchMock = mockAuth(expiresAt);
    await authorizeProduct(" TEST-CODE ", true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ productCode: "TEST-CODE", rememberDays: 90 });
    expect(localStorage.getItem("seat-manager-product-auth-token")).toBe("test-product-token");
    expect(sessionStorage.getItem("seat-manager-product-session-token")).toBeNull();
    sessionStorage.clear();
    vi.setSystemTime(expiresAt - 1);
    expect(isAuthenticated()).toBe(true);
    expect(getProductAuth()).toEqual({ token: "test-product-token", expiresAt });
    vi.setSystemTime(expiresAt);
    expect(isAuthenticated()).toBe(false);
    expect(getProductAuthToken()).toBe("");
  });

  it("does not extend an existing 30-day credential when the application is updated", async () => {
    mockAuth(START + 30 * DAY);
    await authorizeProduct("TEST-CODE", true);
    vi.setSystemTime(START + 30 * DAY);
    expect(isAuthenticated()).toBe(false);
  });

  it("keeps an unchecked login in the current session and preserves the 12-hour expiry", async () => {
    const fetchMock = mockAuth(START + DAY / 2);
    await authorizeProduct("TEST-CODE", false);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).rememberDays).toBe(0);
    expect(localStorage.getItem("seat-manager-product-auth-token")).toBeNull();
    expect(isAuthenticated()).toBe(true);
    vi.setSystemTime(START + DAY / 2);
    expect(isAuthenticated()).toBe(false);
    vi.setSystemTime(START);
    sessionStorage.clear();
    expect(isAuthenticated()).toBe(false);
  });

  it("preserves a remembered login when a later authorization request fails", async () => {
    mockAuth(START + 90 * DAY);
    await authorizeProduct("TEST-CODE", true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(authorizeProduct("TEST-CODE", true)).rejects.toThrow("license_network_failed");
    expect(isAuthenticated()).toBe(true);
  });

  it("clears login on explicit logout while retaining teacher data and the device binding", async () => {
    mockAuth(START + 90 * DAY);
    await authorizeProduct("TEST-CODE", true);
    const deviceId = localStorage.getItem("seat-manager-product-device-id");
    localStorage.setItem("seat-manager-workspaces-v1", "teacher-data");
    clearAuth();
    expect(isAuthenticated()).toBe(false);
    expect(localStorage.getItem("seat-manager-workspaces-v1")).toBe("teacher-data");
    expect(localStorage.getItem("seat-manager-product-device-id")).toBe(deviceId);
  });

  it("clears remembered login and device ID after an explicit successful unbind", async () => {
    mockAuth(START + 90 * DAY);
    await authorizeProduct("TEST-CODE", true);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await unbindCurrentDevice();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-product-token");
    expect(isAuthenticated()).toBe(false);
    expect(localStorage.getItem("seat-manager-product-device-id")).toBeNull();
  });

  it("reuses the remembered product credential for cloud sync after day 30", async () => {
    mockAuth(START + 90 * DAY);
    await authorizeProduct("TEST-CODE", true);
    vi.setSystemTime(START + 89 * DAY);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ exists: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchCloudStatus()).toEqual({ exists: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-product-token");
  });

  it("keeps local development preview temporary and unavailable in production", () => {
    vi.stubEnv("DEV", true);
    expect(enterLocalPreviewSession()).toBe(true);
    expect(localStorage.getItem("seat-manager-product-auth-token")).toBeNull();
    vi.setSystemTime(START + DAY / 2);
    expect(isAuthenticated()).toBe(false);
    clearAuth();
    vi.stubEnv("DEV", false);
    expect(enterLocalPreviewSession()).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });
});
