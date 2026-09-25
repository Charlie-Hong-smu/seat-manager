import type { ScoreMapping } from "../state/scoreImport";

export type ScoreColumnField = "scoreCol" | "rawScoreCol" | "assignedScoreCol" | "rankClassCol" | "rankSchoolCol";

export const SCORE_COLUMN_FIELDS: Array<{ key: ScoreColumnField; label: string }> = [
  { key: "scoreCol", label: "成绩" },
  { key: "rawScoreCol", label: "原始分" },
  { key: "assignedScoreCol", label: "赋分" },
  { key: "rankClassCol", label: "班排" },
  { key: "rankSchoolCol", label: "校排" },
];

export function columnRoleOf(mapping: ScoreMapping, column: number): string {
  if (mapping.nameCol === column) return "name";
  if (mapping.studentNoCol === column) return "studentNo";
  const subjectIndex = mapping.subjectMappings.findIndex(item => SCORE_COLUMN_FIELDS.some(field => item[field.key] === column));
  if (subjectIndex >= 0) {
    const field = SCORE_COLUMN_FIELDS.find(item => mapping.subjectMappings[subjectIndex][item.key] === column);
    if (field) return `subject:${subjectIndex}:${field.key}`;
  }
  const totalField = SCORE_COLUMN_FIELDS.find(field => mapping.totalMapping[field.key] === column);
  return totalField ? `total:${totalField.key}` : "unused";
}

export function assignColumnRole(mapping: ScoreMapping, column: number, role: string): ScoreMapping {
  const next: ScoreMapping = {
    ...mapping,
    subjectMappings: mapping.subjectMappings.map(item => ({ ...item })),
    totalMapping: { ...mapping.totalMapping },
  };
  if (next.nameCol === column) next.nameCol = -1;
  if (next.studentNoCol === column) next.studentNoCol = -1;
  for (const item of next.subjectMappings) {
    for (const field of SCORE_COLUMN_FIELDS) {
      if (item[field.key] === column) item[field.key] = -1;
    }
  }
  for (const field of SCORE_COLUMN_FIELDS) {
    if (next.totalMapping[field.key] === column) next.totalMapping[field.key] = -1;
  }
  if (role === "name") next.nameCol = column;
  else if (role === "studentNo") next.studentNoCol = column;
  else if (role.startsWith("subject:")) {
    const [, indexText, field] = role.split(":");
    const item = next.subjectMappings[Number(indexText)];
    if (item && SCORE_COLUMN_FIELDS.some(entry => entry.key === field)) {
      item[field as ScoreColumnField] = column;
    }
  } else if (role.startsWith("total:")) {
    const field = role.slice("total:".length);
    if (SCORE_COLUMN_FIELDS.some(entry => entry.key === field)) {
      next.totalMapping[field as ScoreColumnField] = column;
    }
  }
  return next;
}

export function columnRoleOptions(mapping: ScoreMapping): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    { value: "unused", label: "未使用" },
    { value: "name", label: "姓名" },
    { value: "studentNo", label: "学号" },
  ];
  mapping.subjectMappings.forEach((item, index) => {
    const name = item.subject || `科目 ${index + 1}`;
    for (const field of SCORE_COLUMN_FIELDS) {
      options.push({ value: `subject:${index}:${field.key}`, label: `${name} · ${field.label}` });
    }
  });
  for (const field of SCORE_COLUMN_FIELDS) {
    options.push({ value: `total:${field.key}`, label: `总分 · ${field.label}` });
  }
  return options;
}

export function columnRoleLabel(mapping: ScoreMapping, column: number): string {
  const role = columnRoleOf(mapping, column);
  return columnRoleOptions(mapping).find(option => option.value === role)?.label || "未使用";
}

export function mappedColumnCount(mapping: ScoreMapping, columnCount: number): number {
  let count = 0;
  for (let column = 0; column < columnCount; column += 1) {
    if (columnRoleOf(mapping, column) !== "unused") count += 1;
  }
  return count;
}
