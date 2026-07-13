import { useCallback } from "react";
import { createDormEvent, createDormitory, createDormStudentRecord, deleteDormitoryEventFromLedger, normalizeDormitoryScore, updateDormitoryEventInLedger, type DormitoryEventPatch, type NewDormEventInput } from "../state/dormitoryActions";
import type { SeatManagerController } from "../state/seatManagerController";
import type { AppStudent, Dormitory, StudentId } from "../state/types";

export function useDormitoryActions({ students, dormitories, setStudents, setDormitories }: {
  students: AppStudent[];
  dormitories: Dormitory[];
  setStudents: SeatManagerController["setStudents"];
  setDormitories: SeatManagerController["setDormitories"];
}) {
  const handleCreateDormitory = useCallback((name: string, baseScore: number) => {
    const dormitory = createDormitory(name, baseScore);
    setDormitories((current) => [dormitory, ...current]);
    return dormitory;
  }, [setDormitories]);

  const handleDeleteDormitory = useCallback((dormitoryId: string) => {
    setDormitories((current) => current.filter((dormitory) => dormitory.id !== dormitoryId));
    setStudents((current) => current.map((student) => student.dormitoryId === dormitoryId ? { ...student, dormitoryId: undefined } : student));
  }, [setDormitories, setStudents]);

  const handleAssignStudentDormitory = useCallback((studentId: StudentId, dormitoryId?: string) => {
    const nextDormitoryId = dormitoryId && dormitories.some((dormitory) => dormitory.id === dormitoryId) ? dormitoryId : undefined;
    setStudents((current) => current.map((student) => student.id === studentId ? { ...student, dormitoryId: nextDormitoryId } : student));
    setDormitories((current) => current.map((dormitory) => {
      const withoutStudent = dormitory.memberIds.filter((id) => id !== studentId);
      return { ...dormitory, memberIds: Array.from(new Set(dormitory.id === nextDormitoryId ? [...withoutStudent, studentId] : withoutStudent)) };
    }));
  }, [dormitories, setDormitories, setStudents]);

  const handleAddDormitoryEvent = useCallback((input: NewDormEventInput) => {
    const dormitory = dormitories.find((item) => item.id === input.dormId);
    if (!dormitory) return null;
    const event = createDormEvent(input, students);
    const nextDormitory = normalizeDormitoryScore({ ...dormitory, events: [event, ...dormitory.events].slice(0, 200) });
    setDormitories((current) => current.map((item) => item.id === dormitory.id ? nextDormitory : item));
    const responsibleIds = event.responsibleStudentIds ?? (event.responsibleStudentId ? [event.responsibleStudentId] : []);
    if (input.recordToStudent !== false && responsibleIds.length) {
      const idSet = new Set(responsibleIds);
      setStudents((current) => current.map((student) => {
        if (!idSet.has(student.id)) return student;
        const record = createDormStudentRecord(event, nextDormitory, student.id);
        return record ? { ...student, records: [record, ...student.records] } : student;
      }));
    }
    return event;
  }, [dormitories, setDormitories, setStudents, students]);

  const handleUpdateDormEvent = useCallback((dormId: string, eventId: string, patch: DormitoryEventPatch) => {
    setDormitories((current) => current.map((dormitory) => dormitory.id === dormId ? updateDormitoryEventInLedger(dormitory, eventId, patch) : dormitory));
    if (patch.date) {
      setStudents((current) => current.map(student => ({
        ...student,
        records: student.records.map(record => record.id === `record-${eventId}-${student.id}` || record.id === `record-${eventId}` ? { ...record, date: patch.date || record.date } : record),
      })));
    }
  }, [setDormitories, setStudents]);

  const handleDeleteDormEvent = useCallback((dormId: string, eventId: string) => {
    setDormitories((current) => current.map((dormitory) => dormitory.id === dormId ? deleteDormitoryEventFromLedger(dormitory, eventId) : dormitory));
    setStudents((current) => current.map((student) => {
      const records = student.records.filter((record) => record.id !== `record-${eventId}` && record.id !== `record-${eventId}-${student.id}`);
      return records.length === student.records.length ? student : { ...student, records };
    }));
  }, [setDormitories, setStudents]);

  return { handleCreateDormitory, handleDeleteDormitory, handleAssignStudentDormitory, handleAddDormitoryEvent, handleUpdateDormEvent, handleDeleteDormEvent };
}
