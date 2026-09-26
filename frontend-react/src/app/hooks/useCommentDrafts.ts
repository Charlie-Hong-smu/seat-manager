import { useCallback, useMemo, useRef, useState } from "react";
import { cacheStudentCommentDraft, readStudentCommentDraft, readStudentCommentDrafts, saveStudentCommentDraft } from "../state/commentStorage";
import { readCommentRubric, readStudentCommentProfile, readStudentCommentProfiles, saveStudentCommentProfile, summarizeCommentProfile } from "../state/commentRubricStorage";
import type { AppStudent, CommentRubric, StudentCommentDraft, StudentId } from "../state/types";
import { resolveCommentWordCount } from "../components/commentEditor";

export interface CommentState {
  studentId: StudentId;
  text: string;
  generated: boolean;
  needsInfo: boolean;
  failed: boolean;
  lengthMode: string;
  style: string;
  targetWordCount: number;
}

function buildInitialComments(students: AppStudent[], failedIds: StudentId[] = []): CommentState[] {
  const failedSet = new Set(failedIds);
  const drafts = readStudentCommentDrafts(students);
  return students.map(s => {
    const draft = drafts[s.id];
    return {
      studentId: s.id,
      text: draft.generatedComment,
      generated: Boolean(draft.generatedComment),
      needsInfo: failedSet.has(s.id) || (s.academicTags.length === 0 && !draft.teacherNote),
      failed: failedSet.has(s.id),
      lengthMode: draft.lengthMode,
      style: draft.style,
      targetWordCount: draft.targetWordCount,
    };
  });
}

/** The shared draft owner for single editing, materials and the batch queue. */
export function useCommentDrafts(students: AppStudent[], failedIds: StudentId[]) {
  const initialRubric = useMemo(() => readCommentRubric(), []);
  const [storedComments, setComments] = useState<CommentState[]>(() => buildInitialComments(students, failedIds));
  const comments = useMemo(() => {
    const byId = new Map(storedComments.map(comment => [comment.studentId, comment]));
    return students.map(student => byId.get(student.id) || buildInitialComments([student])[0]);
  }, [storedComments, students]);
  const [rubric, setRubric] = useState<CommentRubric>(() => initialRubric);
  const persistedProfiles = useMemo(() => readStudentCommentProfiles(students), [students]);
  const [storedProfiles, setCommentProfiles] = useState(persistedProfiles);
  const commentProfiles = useMemo(() => Object.fromEntries(students.map(student => {
    const local = storedProfiles[student.id];
    const saved = persistedProfiles[student.id];
    return [student.id, !local || (Date.parse(saved.updatedAt) || 0) > (Date.parse(local.updatedAt) || 0) ? saved : local];
  })), [students, storedProfiles, persistedProfiles]);
  const [requestedStudentId, setSelectedId] = useState<StudentId>(students[0]?.id || "");
  const selectedId = students.some(student => student.id === requestedStudentId) ? requestedStudentId : students[0]?.id || "";
  const [teacherNote, setTeacherNoteState] = useState(() => commentProfiles[students[0]?.id]?.teacherNote || "");
  const draftContext = useRef({ selectedId, teacherNote, commentProfiles, rubric, students });
  draftContext.current = { selectedId, teacherNote, commentProfiles, rubric, students };
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const revision = useRef(new Map<StudentId, number>());
  const unsavedComments = comments.filter(comment => comment.text !== (commentProfiles[comment.studentId]?.generatedComment || ""));
  const selectedStudentIndex = students.findIndex(student => student.id === selectedId);
  const selectedStudent = students[selectedStudentIndex] || students[0];
  const selectedComment = comments.find(c => c.studentId === selectedStudent?.id) || comments[0];
  const selectedProfile = selectedStudent ? commentProfiles[selectedStudent.id] || readStudentCommentProfile(selectedStudent) : null;
  function updateComment(id: StudentId, patch: Partial<CommentState>) {
    revision.current.set(id, (revision.current.get(id) || 0) + 1);
    const next = commentsRef.current.map(comment => comment.studentId === id ? { ...comment, ...patch, generated: Boolean((patch.text ?? comment.text).trim()) } : comment);
    commentsRef.current = next;
    setComments(next);
    const changed = next.find(comment => comment.studentId === id);
    if (changed) cacheStudentCommentDraft(id, buildDraft(changed));
  }

  function buildDraft(comment: CommentState, note?: string): StudentCommentDraft {
    const context = draftContext.current;
    const profile = context.commentProfiles[comment.studentId];
    const summary = profile ? summarizeCommentProfile(context.rubric, profile) : { criteriaSummary: [], customOptions: [] };
    const student = context.students.find(item => item.id === comment.studentId);
    const recoveredNote = student ? readStudentCommentDraft(student).teacherNote : "";
    const draftTeacherNote = note ?? (comment.studentId === context.selectedId ? context.teacherNote : recoveredNote);
    return {
      generatedComment: comment.text,
      teacherNote: draftTeacherNote,
      style: comment.style as "warm" | "formal" | "brief",
      lengthMode: comment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(comment.lengthMode as "short" | "standard" | "long" | "custom", comment.targetWordCount),
      updatedAt: new Date().toISOString(),
      criteriaSummary: summary.criteriaSummary,
      customOptions: summary.customOptions,
    };
  }

  function saveSelectedComment() {
    if (!selectedStudent || !selectedComment) return;
    if (selectedProfile) {
      const savedProfile = saveStudentCommentProfile(selectedStudent.id, rubric, {
        ...selectedProfile,
        teacherNote,
        style: selectedComment.style as "warm" | "formal" | "brief",
        lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
        generatedComment: selectedComment.text,
        status: selectedComment.text.trim() ? "edited" : "draft",
        updatedAt: new Date().toISOString(),
      });
      setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: savedProfile }));
    }
    const saved = saveStudentCommentDraft(selectedStudent.id, {
      generatedComment: selectedComment.text,
      teacherNote,
      style: selectedComment.style as "warm" | "formal" | "brief",
      lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(selectedComment.lengthMode as "short" | "standard" | "long" | "custom", selectedComment.targetWordCount),
      updatedAt: new Date().toISOString(),
    });
    updateComment(selectedStudent.id, { text: saved.generatedComment, generated: Boolean(saved.generatedComment) });
    return selectedStudent.name;
  }

  const setTeacherNote = useCallback((value: string) => {
    draftContext.current.teacherNote = value;
    setTeacherNoteState(value);
  }, []);
  function markEdited(id: StudentId) { revision.current.set(id, (revision.current.get(id) || 0) + 1); }
  return { students, initialRubric, comments, rubric, setRubric, commentProfiles, setCommentProfiles,
    selectedId, setSelectedId, teacherNote, setTeacherNote, selectedStudentIndex, selectedStudent, selectedComment, selectedProfile,
    unsavedComments, updateComment, buildDraft, saveSelectedComment, markEdited,
    getStudent: (id: StudentId) => draftContext.current.students.find(student => student.id === id),
    getComment: (id: StudentId) => commentsRef.current.find(comment => comment.studentId === id),
    getRevision: (id: StudentId) => revision.current.get(id) || 0,
  };
}

export type CommentDrafts = ReturnType<typeof useCommentDrafts>;
