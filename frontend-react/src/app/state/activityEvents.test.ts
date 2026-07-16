import { describe, expect, it } from "vitest";

import { createActivityEvent, normalizeActivityEvents, normalizeBusinessEntityRef } from "./activityEvents";

describe("activity events", () => {
  it("normalizes old and precise business references without mutating input", () => {
    const source = { domain: "score", entityId: "exam-1", subEntityId: "q-2", studentId: "s1", date: "2026-07-14" };
    expect(normalizeBusinessEntityRef(source)).toEqual(source);
    expect(normalizeBusinessEntityRef({ domain: "homework", entityId: "h1" })).toEqual({ domain: "homework", entityId: "h1", subEntityId: undefined, studentId: undefined, date: undefined });
    expect(normalizeBusinessEntityRef({ domain: "unknown", entityId: "x" })).toBeUndefined();
  });

  it("sorts valid immutable events and ignores malformed rows", () => {
    const older = createActivityEvent({ action: "created", ref: { domain: "followup", entityId: "t1" }, studentIds: ["s1"], title: "创建", detail: "", occurredAt: "2026-07-14T08:00:00.000Z" });
    const newer = createActivityEvent({ action: "updated", ref: { domain: "followup", entityId: "t1" }, studentIds: ["s1"], title: "更新", detail: "", occurredAt: "2026-07-14T09:00:00.000Z" });
    expect(normalizeActivityEvents([older, { bad: true }, newer]).map(event => event.title)).toEqual(["更新", "创建"]);
  });
});
