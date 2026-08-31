import { removeStudentFromFollowups } from "../state/followupStudents";
import { useCallback } from "react";
import { placeStudentInFirstEmptySeat, type SeatOrder } from "../state/seatActions";
import type { SeatManagerController } from "../state/seatManagerController";
import { createStudent, createStudentRecord } from "../state/studentActions";
import { readCommentRubric, readStudentCommentProfile, saveStudentCommentProfile } from "../state/commentRubricStorage";
import type { AppStudent, Gender, SeatLayoutV1, StudentId, StudentRecord } from "../state/types";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function useStudentActions({ students, seatOrder, seatLayout, setStudents, setDormitories, setSeatSettings, setAttendanceRecords, setFollowupTasks, commitSeatOrder, closeStudentDetail }: {
  students: AppStudent[];
  seatOrder: SeatOrder;
  seatLayout?: SeatLayoutV1;
  setStudents: SeatManagerController["setStudents"];
  setDormitories: SeatManagerController["setDormitories"];
  setSeatSettings: SeatManagerController["setSeatSettings"];
  setAttendanceRecords: SeatManagerController["setAttendanceRecords"];
  setFollowupTasks: SeatManagerController["setFollowupTasks"];
  commitSeatOrder: (next: SeatOrder) => void;
  closeStudentDetail: () => void;
}) {
  const handleAddStudent = useCallback((name: string, gender: Gender, alias?: string) => {
    const student = createStudent({ name, gender, alias });
    setStudents((current) => [...current, student]);
    commitSeatOrder(placeStudentInFirstEmptySeat(seatOrder, student.id, students.length + 1, seatLayout));
  }, [commitSeatOrder, seatLayout, seatOrder, setStudents, students.length]);

  const handleUpdateStudent = useCallback((nextStudent: AppStudent) => setStudents((current) => current.map((student) => student.id === nextStudent.id ? nextStudent : student)), [setStudents]);

  const handleApplyStudentRecord = useCallback((studentId: StudentId, record: StudentRecord, syncIds: StudentId[]) => {
    const syncSet = new Set(syncIds.filter((id) => id !== studentId));
    setStudents((current) => current.map((student) => student.id === studentId ? { ...student, records: [record, ...student.records] } : syncSet.has(student.id) ? { ...student, records: [{ ...record, id: `${record.id}-${student.id}` }, ...student.records] } : student));
  }, [setStudents]);

  const handleSaveAiAssistantRecord = useCallback((student: AppStudent, note: string) => {
    handleApplyStudentRecord(student.id, createStudentRecord("note", `AI助手：${note}`.slice(0, 800)), []);
  }, [handleApplyStudentRecord]);

  const handleAppendAiAssistantMaterial = useCallback((student: AppStudent, text: string) => {
    const rubric = readCommentRubric();
    const profile = readStudentCommentProfile(student);
    const savedProfile = saveStudentCommentProfile(student.id, rubric, {
      ...profile,
      teacherNote: [profile.teacherNote, `AI助手素材：${text}`].map((item) => item.trim()).filter(Boolean).join("\n"),
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    const aiComments = isPlainRecord(student.aiComments) ? student.aiComments : {};
    setStudents((current) => current.map((item) => item.id === student.id ? { ...student, aiComments: { ...aiComments, profile: savedProfile } } : item));
  }, [setStudents]);

  const handleDeleteStudent = useCallback((studentId: StudentId) => {
    setStudents((current) => current.filter((student) => student.id !== studentId));
    setDormitories((current) => current.map((dormitory) => ({ ...dormitory, memberIds: dormitory.memberIds.filter((id) => id !== studentId) })));
    commitSeatOrder(seatOrder.map((id) => id === studentId ? null : id));
    setSeatSettings((current) => ({ ...current, constraints: { ...current.constraints, lockedDeskmatePairs: current.constraints.lockedDeskmatePairs.filter((pair) => pair.a !== studentId && pair.b !== studentId), noDeskmatePairs: current.constraints.noDeskmatePairs.filter((pair) => pair.a !== studentId && pair.b !== studentId), frontRowStudentIds: current.constraints.frontRowStudentIds.filter((id) => id !== studentId) } }));
    setAttendanceRecords(current => current.filter(record => record.studentId !== studentId));
    setFollowupTasks(current => removeStudentFromFollowups(current, studentId));
    closeStudentDetail();
  }, [closeStudentDetail, commitSeatOrder, seatOrder, setAttendanceRecords, setDormitories, setFollowupTasks, setSeatSettings, setStudents]);

  return { handleAddStudent, handleUpdateStudent, handleApplyStudentRecord, handleSaveAiAssistantRecord, handleAppendAiAssistantMaterial, handleDeleteStudent };
}
