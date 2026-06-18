import type { AppStudent, Gender } from "./types";

export interface NewStudentInput {
  name: string;
  gender: Gender;
  alias?: string;
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
