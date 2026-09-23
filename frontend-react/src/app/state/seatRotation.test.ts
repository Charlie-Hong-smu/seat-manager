import { describe, expect, it } from "vitest";
import { createDefaultSeatSettings, createSeatManagerState } from "./legacyStateAdapter";
import { buildLegacySnapshot } from "./legacyWriteAdapter";
import { buildSeatRotationContext, createRotationSnapshot, evaluateSeatRotation } from "./seatRotation";
import { captureSeatChange, restoreSeatChange } from "./seatWorkflow";
import type { SeatHistorySnapshot } from "./types";

const students = ["a", "b", "c", "d"].map(id => ({ id, name: id, gender: "男" as const, aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [] }));
const prior = (studentIds?: Array<string | null>): SeatHistorySnapshot => ({ id: "old", time: "2026-09-20", note: "旧座位", rows: 1, seats: ["a", "b", "c", "d", "", "", "", ""], studentIds });

describe("seat rotation history", () => {
  it("avoids recent positions and neighbors while ignoring name-only snapshots", () => {
    const current = ["a", "b", "c", "d", null, null, null, null];
    const context = buildSeatRotationContext(current, undefined, [prior(), prior(["c", "d", "a", "b", null, null, null, null])], students);
    expect(context.savedCount).toBe(1);
    const repeated = evaluateSeatRotation(current, undefined, context);
    const changed = evaluateSeatRotation(["b", "c", "d", "a", null, null, null, null], undefined, context);
    expect(repeated.sameSeatStudents).toEqual(["a", "b", "c", "d"]);
    expect(repeated.repeatedNeighborPairs).toContainEqual(["a", "b"]);
    expect(changed.penalty).toBeLessThan(repeated.penalty);
    expect(evaluateSeatRotation(current, undefined, context, new Set([0])).sameSeatStudents).not.toContain("a");
  });

  it("records adopted rotations by stable IDs and removes the auto snapshot on undo", () => {
    const before = createSeatManagerState({ students, seatOrder: ["a", "b", "c", "d", null, null, null, null] });
    const after = { ...before, seatOrder: ["b", "a", "d", "c", null, null, null, null] };
    const snapshot = createRotationSnapshot(after, "自动轮换");
    const persisted = createSeatManagerState(JSON.parse(JSON.stringify(buildLegacySnapshot({ ...after, seatHistory: [snapshot] }))));
    expect(persisted.seatHistory[0]).toMatchObject({ source: "rotation", studentIds: after.seatOrder });
    const restored = restoreSeatChange(persisted, { ...captureSeatChange(before, after), rotationSnapshotId: snapshot.id });
    expect(restored.seatOrder).toEqual(before.seatOrder);
    expect(restored.seatHistory).toEqual([]);
    expect(createDefaultSeatSettings().rotateWithHistory).toBe(true);
  });
});
