import type { AppStudent } from "./types";

export function createTestStudent(id = "s1", name = "张三"): AppStudent {
  return {
    id,
    name,
    gender: "男",
    aliases: [],
    tags: [],
    academicTags: [],
    manualTagIds: [],
    autoTagIds: [],
    records: [],
    exams: [],
  };
}
