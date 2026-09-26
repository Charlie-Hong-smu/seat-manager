import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useScopedRequest } from "./useScopedRequest";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import { emptyCommentBatchState, saveCommentBatchState, type CommentBatchState } from "../components/commentBatchStorage";
import { getCommentAiErrorMessage as getAiErrorMessage } from "../components/commentEditor";
import type { useAppDialog } from "../components/ui";
import type { StudentId } from "../state/types";
import type { CommentDrafts } from "./useCommentDrafts";

interface Options {
  drafts: CommentDrafts;
  initialState: CommentBatchState;
  selectedBatchIds: Set<StudentId>;
  setSelectedBatchIds: Dispatch<SetStateAction<Set<StudentId>>>;
  accessCode: string; rememberAuth: boolean;
  setAccessCode: (value: string) => void; setHasAuth: (value: boolean) => void;
  setAiStatus: (value: string) => void;
  confirm: ReturnType<typeof useAppDialog>["confirm"];
  onStart: () => void; onFinish: () => void;
}

export function useCommentBatch({ drafts, initialState, selectedBatchIds, setSelectedBatchIds, accessCode, rememberAuth, setAccessCode, setHasAuth, setAiStatus, confirm, onStart, onFinish }: Options) {
  const { students, comments, buildDraft, updateComment } = drafts;
  const currentScope = getCurrentWorkspaceScope();
  const rosterScope = `${currentScope}:${students.map(student => student.id).join("|")}`;
  const batchRequest = useScopedRequest(rosterScope);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchState, setBatchState] = useState(initialState);
  const pauseRequested = useRef(false);
  useEffect(() => { setBatchRunning(false); }, [rosterScope]);
  function commitBatchState(next: CommentBatchState) {
    const normalized = {
      ...next,
      queue: Array.from(new Set(next.queue)),
      failed: Array.from(new Set(next.failed)),
      updatedAt: new Date().toISOString(),
    };
    setBatchState(normalized);
    saveCommentBatchState(normalized);
  }

  function clearBatchState() {
    commitBatchState(emptyCommentBatchState());
  }

  function isRecoverableAuthError(reason: string): boolean {
    return reason === "ai_auth_required" || reason === "ai_unauthorized" || reason === "ai_auth_failed" || reason === "ai_rate_limited";
  }

  async function runBatchQueue(seed: CommentBatchState) {
    if (batchRunning) return;
    const request = batchRequest.start();
    setBatchRunning(true);
    onStart();
    pauseRequested.current = false;
    const queue = [...seed.queue];
    const failed = [...seed.failed];
    let done = seed.done;
    let skippedEdits = 0;
    const total = seed.total || queue.length;
    commitBatchState({ ...seed, queue, failed, done, total, status: "running" });

    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
        if (pauseRequested.current) {
          const paused = { queue: queue.slice(i), failed, done, total, status: "paused" as const, updatedAt: "" };
          commitBatchState(paused);
          setAiStatus(`已暂停，剩余 ${paused.queue.length} 人。`);
          return;
        }
        const studentId = queue[i];
        const student = drafts.getStudent(studentId);
        if (!student) {
          done += 1;
          continue;
        }
        const comment = drafts.getComment(studentId);
        if (!comment) {
          done += 1;
          continue;
        }
        setAiStatus(`正在生成 ${done + 1}/${total}：${student.name}`);
        const inputRevision = drafts.getRevision(studentId);
        try {
          const result = await generateStudentAiComment(student, buildDraft(comment), {
            accessCode,
            remember: rememberAuth,
            force: true,
            signal: request.signal,
          });
          if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
          done += 1;
          if ((drafts.getRevision(studentId)) !== inputRevision) {
            skippedEdits += 1;
          } else if (result.comment) {
            updateComment(student.id, {
              text: result.comment,
              generated: true,
              needsInfo: Boolean(result.needsMoreInfo),
              failed: false,
            });
          } else {
            updateComment(student.id, { needsInfo: true, failed: false });
          }
          commitBatchState({
            queue: queue.slice(i + 1),
            failed,
            done,
            total,
            status: "running",
            updatedAt: "",
          });
        } catch (error) {
          if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
          const reason = error instanceof Error ? error.message : "";
          failed.push(student.id);
          updateComment(student.id, { needsInfo: true, failed: true });
          const remainingQueue = queue.slice(i + 1);
          commitBatchState({
            queue: remainingQueue,
            failed,
            done,
            total,
            status: "failed",
            updatedAt: "",
          });
          setAiStatus(`${student.name} 生成失败：${getAiErrorMessage(reason)}`);
          if (isRecoverableAuthError(reason)) {
            return;
          }
        }
      }
      setAccessCode("");
      setHasAuth(true);
      setSelectedBatchIds(new Set());
      const finalState = { queue: [], failed, done: total, total, status: failed.length ? "failed" as const : "complete" as const, updatedAt: "" };
      commitBatchState(finalState);
      if (failed.length) {
        setAiStatus(`批量生成完成，${failed.length} 人失败，可重试失败项。`);
      } else {
        setAiStatus(skippedEdits ? `草稿生成完成；${skippedEdits} 人保留了生成期间的手动修改。请核对后保存。` : "草稿生成完成，请核对后保存。");
      }
    } catch (error) {
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
    } finally {
      if (request.isCurrent() && getCurrentWorkspaceScope() === currentScope) { setBatchRunning(false); onFinish(); }
    }
  }

  async function startBatch() {
    const failedIds = new Set(batchState.failed);
    const selectedIds = students.filter(student => selectedBatchIds.has(student.id)).map(student => student.id);
    const pending = selectedIds.length
      ? comments.filter(c => selectedIds.includes(c.studentId))
      : comments.filter(c => !c.generated || failedIds.has(c.studentId));
    if (!pending.length) {
      setAiStatus(selectedIds.length ? "请选择要批量生成的学生。" : "没有待生成的学生。");
      clearBatchState();
      return;
    }
    const replacing = pending.filter(comment => comment.text.trim()).length;
    if (replacing && !await confirm({ title: `重新生成 ${replacing} 份已有草稿？`, description: "生成结果会替换这些学生当前的草稿；正式保存的评语保持原样，直到你再次确认保存。", confirmLabel: "重新生成", variant: "primary" })) return;
    if (getCurrentWorkspaceScope() !== currentScope) return;
    const next = {
      queue: pending.map(c => c.studentId),
      failed: [],
      done: 0,
      total: pending.length,
      status: "running" as const,
      updatedAt: "",
    };
    if (selectedIds.length) {
      setAiStatus(`准备为已选 ${pending.length} 名学生批量生成评语。`);
    }
    void runBatchQueue(next);
  }

  function resumeBatch() {
    const retryIds = batchState.queue.length ? batchState.queue : batchState.failed;
    if (!retryIds.length) {
      setAiStatus("没有可继续的队列。");
      return;
    }
    const next = {
      queue: retryIds,
      failed: batchState.queue.length ? batchState.failed : [],
      done: batchState.queue.length ? batchState.done : 0,
      total: batchState.queue.length ? batchState.total : retryIds.length,
      status: "running" as const,
      updatedAt: "",
    };
    void runBatchQueue(next);
  }

  function pauseBatch() {
    pauseRequested.current = true;
    setAiStatus("正在暂停，当前学生生成完成后停止。");
  }

  return { batchRunning, batchState, startBatch, resumeBatch, pauseBatch, clearBatchState,
    batchProgress: batchState.total ? Math.round((batchState.done / batchState.total) * 100) : 0,
    resumableCount: batchState.queue.length + batchState.failed.length,
    markGenerated(id: StudentId) {
      if (getCurrentWorkspaceScope() === currentScope && batchState.failed.includes(id)) {
        commitBatchState({ ...batchState, failed: batchState.failed.filter(studentId => studentId !== id) });
      }
    },
  };
}
