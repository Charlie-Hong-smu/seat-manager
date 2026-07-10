import { describe, expect, it, vi } from "vitest";

import { clearAiApiAuth, fetchAiRoute, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";

describe("AiApiClient", () => {
  it("stores and reuses local AI authentication", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "token-1", expiresAt: Date.now() + 60_000 }), { status: 200 })));
    expect(await getAiAuth({ accessCode: "code", remember: true })).toEqual(expect.objectContaining({ token: "token-1" }));
    expect(hasStoredAiApiAuth()).toBe(true);
    expect(await getAiAuth()).toEqual(expect.objectContaining({ token: "token-1" }));
    clearAiApiAuth();
    expect(hasStoredAiApiAuth()).toBe(false);
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
