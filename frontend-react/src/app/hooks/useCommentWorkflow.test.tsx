import { useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCommentDrafts } from "./useCommentDrafts";
import { useCommentEditor } from "./useCommentEditor";
import { useCommentBatch } from "./useCommentBatch";
import { generateStudentAiComment } from "../state/aiCommentService";
import { createTestStudent } from "../state/testFixtures";
import { readStudentCommentDraft } from "../state/commentStorage";
import { createSeatManagerState } from "../state/legacyStateAdapter";
import { readLegacyRootState } from "../state/storage";
import { advanceToNextTerm, ensureWorkspaceBook, makeTerm, switchSlice, writeCurrentSliceData } from "../state/workspaces";
import { emptyCommentBatchState, loadCommentBatchState } from "../components/commentBatchStorage";

vi.mock("../state/aiCommentService", () => ({ generateStudentAiComment: vi.fn(), hasStoredAiAuth: () => true }));
const generate = vi.mocked(generateStudentAiComment);
const students = [createTestStudent("a", "甲"), createTestStudent("b", "乙")];
const confirm = vi.fn(async () => true);

function deferred() {
  let resolve!: (value: Awaited<ReturnType<typeof generateStudentAiComment>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof generateStudentAiComment>>>(done => { resolve = done; });
  return { promise, resolve };
}

function useWorkflow() {
  const drafts = useCommentDrafts(students, []);
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set<string>());
  const [status, setAiStatus] = useState("");
  const auth = { accessCode: "", rememberAuth: true, setAccessCode: () => {}, setHasAuth: () => {}, setAiStatus };
  const batch = useCommentBatch({ drafts, ...auth, initialState: emptyCommentBatchState(), selectedBatchIds, setSelectedBatchIds,
    confirm, onStart: () => editor.beginBatch(), onFinish: () => editor.endBatch() });
  const editor = useCommentEditor({ drafts, ...auth, onGenerated: batch.markGenerated });
  return { drafts, batch, editor, status };
}

function savedText(id: string) {
  const student = createSeatManagerState(readLegacyRootState()).students.find(item => item.id === id)!;
  return readStudentCommentDraft(student, null).generatedComment;
}

beforeEach(() => {
  generate.mockReset(); confirm.mockClear();
  writeCurrentSliceData({ students, seatOrder: students.map(student => student.id) });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps generated and edited text in recoverable drafts until the teacher saves", async () => {
  generate.mockResolvedValue({ comment: "生成的草稿" });
  const hook = renderHook(useWorkflow);
  await act(async () => { await hook.result.current.editor.generateSingle(); });
  expect(hook.result.current.drafts.selectedComment.text).toBe("生成的草稿");
  expect(readStudentCommentDraft(students[0]).generatedComment).toBe("生成的草稿");
  expect(savedText("a")).toBe("");
  act(() => { hook.result.current.drafts.updateComment("a", { text: "老师修改后确认" }); });
  expect(savedText("a")).toBe("");
  act(() => { hook.result.current.drafts.saveSelectedComment(); });
  expect(savedText("a")).toBe("老师修改后确认");
  expect(savedText("b")).toBe("");
});

it("discards a late single result after selecting another student even if the service ignores abort", async () => {
  const pending = deferred(); generate.mockReturnValue(pending.promise);
  const hook = renderHook(useWorkflow);
  let request!: Promise<void>;
  act(() => { request = hook.result.current.editor.generateSingle(); });
  const signal = generate.mock.calls[0][2]?.signal;
  act(() => { hook.result.current.drafts.setSelectedId("b"); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve({ comment: "过期结果" }); await request; });
  expect(hook.result.current.drafts.comments.every(comment => comment.text === "")).toBe(true);
  expect(hook.result.current.editor.singleGenerationPhase).toBe("idle");
});

it("pauses after the current student, keeps concurrent teacher edits, and resumes the remaining queue", async () => {
  const pending = deferred(); generate.mockReturnValueOnce(pending.promise).mockResolvedValue({ comment: "乙草稿" });
  const hook = renderHook(useWorkflow);
  await act(async () => { await hook.result.current.batch.startBatch(); });
  act(() => { hook.result.current.drafts.updateComment("a", { text: "老师正在写" }); hook.result.current.batch.pauseBatch(); });
  await act(async () => { pending.resolve({ comment: "会覆盖老师的旧结果" }); });
  await waitFor(() => expect(hook.result.current.batch.batchState.status).toBe("paused"));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(hook.result.current.drafts.getComment("a")?.text).toBe("老师正在写");
  expect(loadCommentBatchState(students)).toMatchObject({ queue: ["b"], done: 1, status: "paused" });
  act(() => { hook.result.current.batch.resumeBatch(); });
  await waitFor(() => expect(hook.result.current.batch.batchState.status).toBe("complete"));
  expect(hook.result.current.drafts.getComment("b")?.text).toBe("乙草稿");
  expect(generate).toHaveBeenCalledTimes(2);
  expect(savedText("a")).toBe(""); expect(savedText("b")).toBe("");
});

it("retains failed students for retry without regenerating completed drafts", async () => {
  generate.mockRejectedValueOnce(new Error("upstream_failed")).mockResolvedValue({ comment: "成功草稿" });
  const hook = renderHook(useWorkflow);
  await act(async () => { await hook.result.current.batch.startBatch(); });
  await waitFor(() => expect(hook.result.current.batch.batchRunning).toBe(false));
  expect(hook.result.current.batch.batchState).toMatchObject({ failed: ["a"], queue: [], status: "failed" });
  act(() => { hook.result.current.batch.resumeBatch(); });
  await waitFor(() => expect(hook.result.current.batch.batchState.status).toBe("complete"));
  expect(generate.mock.calls.map(call => call[0].id)).toEqual(["a", "b", "a"]);
  expect(hook.result.current.drafts.getComment("a")?.failed).toBe(false);
});

it("does not write a batch result or queue into a workspace selected while the request was pending", async () => {
  const pending = deferred(); generate.mockReturnValue(pending.promise);
  const hook = renderHook(useWorkflow);
  await act(async () => { await hook.result.current.batch.startBatch(); });
  const oldSlice = ensureWorkspaceBook().currentSliceId;
  const next = advanceToNextTerm({ fromSliceId: oldSlice, term: makeTerm({ year: 2027, season: "spring" }), copyRoster: true })!;
  switchSlice(next.id);
  hook.rerender();
  expect(generate.mock.calls[0][2]?.signal?.aborted).toBe(true);
  await act(async () => { pending.resolve({ comment: "旧班级结果" }); });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(readStudentCommentDraft(students[0]).generatedComment).toBe("");
  expect(loadCommentBatchState(students).status).toBe("idle");
  switchSlice(oldSlice);
  expect(loadCommentBatchState(students).queue).toEqual(["a", "b"]);
});
