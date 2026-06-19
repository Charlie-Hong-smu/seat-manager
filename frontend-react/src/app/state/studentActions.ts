import { getTagLabels, isAcademicTagLabel } from "./tagCatalog";
import type { AppStudent, Gender, RecordType, StudentRecord } from "./types";

export interface NewStudentInput {
  name: string;
  gender: Gender;
  alias?: string;
}

export interface StudentProfileInput {
  name: string;
  gender: Gender;
  aliases: string[];
  manualTagIds: string[];
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveTagLabels(manualTagIds: string[], autoTagIds: string[]) {
  const labels = getTagLabels([...manualTagIds, ...autoTagIds]);
  return {
    tags: labels.filter(label => !isAcademicTagLabel(label)),
    academicTags: labels.filter(isAcademicTagLabel),
  };
}

export function createStudent(input: NewStudentInput): AppStudent {
  const alias = input.alias?.trim();

  return {
    id: `react-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    gender: input.gender,
    aliases: alias ? [alias] : [],
    tags: [],
    academicTags: [],
    manualTagIds: [],
    autoTagIds: [],
    records: [],
    exams: [],
  };
}

export function updateStudentProfile(student: AppStudent, input: StudentProfileInput): AppStudent {
  const manualTagIds = Array.from(new Set(input.manualTagIds.map(id => id.trim()).filter(Boolean)));
  const aliases = Array.from(new Set(input.aliases.map(alias => alias.trim()).filter(Boolean)));
  const derivedTags = deriveTagLabels(manualTagIds, student.autoTagIds);
  const hasStoredTagIds = manualTagIds.length > 0 || student.autoTagIds.length > 0;

  return {
    ...student,
    name: input.name.trim() || student.name,
    gender: input.gender,
    aliases,
    manualTagIds,
    tags: hasStoredTagIds ? derivedTags.tags : student.tags,
    academicTags: student.autoTagIds.length > 0 ? derivedTags.academicTags : student.academicTags,
  };
}

export function createStudentRecord(type: RecordType, note: string): StudentRecord {
  return {
    id: `record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    note: note.trim(),
    date: todayString(),
  };
}
