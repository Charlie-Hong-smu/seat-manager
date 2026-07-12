import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAiApiAuth, fetchAiRoute, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";

describe("AiApiClient", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the product license token for AI in every edition", async () => {
    localStorage.setItem("seat-manager-product-auth-token", "product-token");
    localStorage.setItem("seat-manager-product-auth-expires", String(Date.now() + 60_000));
    expect(hasStoredAiApiAuth()).toBe(true);
    expect(await getAiAuth()).toEqual(expect.objectContaining({ token: "product-token" }));
  });

  it("does not fall back to a second AI access code", async () => {
    expect(hasStoredAiApiAuth()).toBe(true);
    await expect(getAiAuth({ accessCode: "legacy-code", remember: true })).rejects.toThrow("ai_auth_required");
    clearAiApiAuth();
    expect(hasStoredAiApiAuth()).toBe(true);
  });

  it("falls back to the direct Worker when a proxy route is missing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchAiRoute("/student-followup", { method: "POST" })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
