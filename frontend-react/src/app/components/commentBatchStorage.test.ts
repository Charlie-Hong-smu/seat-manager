import { beforeEach, describe, expect, it } from "vitest";
import { COMMENT_BATCH_STATE_KEY, loadCommentBatchState, saveCommentBatchState } from "./commentBatchStorage";
import { createTestStudent } from "../state/testFixtures";

describe("comment batch recovery storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores only students that still exist", () => {
    const students = [createTestStudent()];
    window.localStorage.setItem(COMMENT_BATCH_STATE_KEY, JSON.stringify({
      queue: [students[0].id, "removed-student"], failed: [students[0].id], done: 1, total: 2, status: "paused", updatedAt: "now",
    }));
    expect(loadCommentBatchState(students)).toMatchObject({ queue: [students[0].id], failed: [students[0].id], status: "paused" });
  });

  it("removes completed empty batches", () => {
    window.localStorage.setItem(COMMENT_BATCH_STATE_KEY, "stale");
    saveCommentBatchState({ queue: [], failed: [], done: 2, total: 2, status: "complete", updatedAt: "now" });
    expect(window.localStorage.getItem(COMMENT_BATCH_STATE_KEY)).toBeNull();
  });
});
