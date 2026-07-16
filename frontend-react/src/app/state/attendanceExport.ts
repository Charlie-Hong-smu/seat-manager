import type { AppStudent, AttendanceRecord } from "./types";

export function buildAttendanceCsv(students: AppStudent[], records: AttendanceRecord[], date: string): string {
  const recordsByStudent = new Map(records.filter(item => item.date === date).map(item => [item.studentId, item]));
  const rows = [["日期", "姓名", "状态", "迟到", "早退", "请假开始", "请假结束", "备注"], ...students.map(student => {
    const item = recordsByStudent.get(student.id);
    return [date, student.name, item?.status === "leave" ? "请假" : item?.status === "absent" ? "缺勤" : "正常", item?.late ? "是" : "", item?.earlyLeave ? "是" : "", item?.leaveStart || "", item?.leaveEnd || "", item?.note || ""];
  })];
  return `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
}
