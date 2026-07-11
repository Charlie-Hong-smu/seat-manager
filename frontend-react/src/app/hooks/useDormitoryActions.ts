import { useCallback } from "react";
import { closeDormitoryPeriod, createDormEvent, createDormitory, createDormStudentRecord, normalizeDormitoryScore, type NewDormEventInput } from "../state/dormitoryActions";
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

  const handleUpdateDormitory = useCallback((dormitoryId: string, patch: Partial<Pick<Dormitory, "name" | "baseScore">>) => {
    setDormitories((current) => current.map((dormitory) => dormitory.id !== dormitoryId ? dormitory : normalizeDormitoryScore({
      ...dormitory,
      name: patch.name !== undefined ? patch.name.trim() || dormitory.name : dormitory.name,
      baseScore: patch.baseScore !== undefined && Number.isFinite(patch.baseScore) ? patch.baseScore : dormitory.baseScore,
    })));
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

  const handleUpdateDormEvent = useCallback((dormId: string, eventId: string, patch: { reason?: string; score?: number; note?: string; punishment?: string; punishmentDone?: boolean; followupTaskIds?: string[] }) => {
    setDormitories((current) => current.map((dormitory) => {
      if (dormitory.id !== dormId) return dormitory;
      const events = dormitory.events.map((event) => {
        if (event.id !== eventId) return event;
        const nextScore = patch.score !== undefined && Number.isFinite(patch.score) ? Math.round(patch.score * 10) / 10 : event.score;
        return { ...event, reason: patch.reason !== undefined ? patch.reason.trim() || event.reason : event.reason, score: nextScore, type: nextScore > 0 ? "reward" as const : nextScore < 0 ? "punish" as const : "note" as const, note: patch.note !== undefined ? patch.note.trim() : event.note, punishment: patch.punishment !== undefined ? patch.punishment.trim() : event.punishment, punishmentDone: patch.punishmentDone !== undefined ? patch.punishmentDone : event.punishmentDone, followupTaskIds: patch.followupTaskIds !== undefined ? patch.followupTaskIds : event.followupTaskIds };
      });
      return normalizeDormitoryScore({ ...dormitory, events });
    }));
  }, [setDormitories]);

  const handleDeleteDormEvent = useCallback((dormId: string, eventId: string) => {
    const target = dormitories.find((dormitory) => dormitory.id === dormId)?.events.find((event) => event.id === eventId);
    const responsibleIds = target?.responsibleStudentIds ?? (target?.responsibleStudentId ? [target.responsibleStudentId] : []);
    setDormitories((current) => current.map((dormitory) => dormitory.id !== dormId ? dormitory : normalizeDormitoryScore({ ...dormitory, events: dormitory.events.filter((event) => event.id !== eventId) })));
    if (responsibleIds.length) {
      const idSet = new Set(responsibleIds);
      setStudents((current) => current.map((student) => !idSet.has(student.id) ? student : {
        ...student,
        records: student.records.filter((record) => record.id !== `record-${eventId}` && !responsibleIds.some((id) => record.id === `record-${eventId}-${id}`)),
      }));
    }
  }, [dormitories, setDormitories, setStudents]);

  const handleCloseDormitoryPeriod = useCallback((dormId: string, options: { carryOver?: boolean } = {}) => setDormitories((current) => current.map((dormitory) => dormitory.id === dormId ? closeDormitoryPeriod(dormitory, options) : dormitory)), [setDormitories]);
  const handleCloseAllDormitoryPeriods = useCallback((options: { carryOver?: boolean } = {}) => setDormitories((current) => current.map((dormitory) => dormitory.events.length ? closeDormitoryPeriod(dormitory, options) : dormitory)), [setDormitories]);

  return { handleCreateDormitory, handleUpdateDormitory, handleDeleteDormitory, handleAssignStudentDormitory, handleAddDormitoryEvent, handleUpdateDormEvent, handleDeleteDormEvent, handleCloseDormitoryPeriod, handleCloseAllDormitoryPeriods };
}
