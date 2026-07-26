import { buildCsvContent } from "./csv";
import type { AppStudent, AttendanceRecord } from "./types";

const DETAIL_HEADER = ["日期", "姓名", "状态", "迟到", "早退", "请假开始", "请假结束", "备注"];

function statusLabel(record?: AttendanceRecord): string {
  return record?.status === "leave" ? "请假" : record?.status === "absent" ? "缺勤" : "正常";
}

function recordDetailRow(date: string, name: string, item?: AttendanceRecord): string[] {
  return [date, name, statusLabel(item), item?.late ? "是" : "", item?.earlyLeave ? "是" : "", item?.leaveStart || "", item?.leaveEnd || "", item?.note || ""];
}

const toCsv = buildCsvContent;

export function buildAttendanceCsv(students: AppStudent[], records: AttendanceRecord[], date: string): string {
  const recordsByStudent = new Map(records.filter(item => item.date === date).map(item => [item.studentId, item]));
  return toCsv([DETAIL_HEADER, ...students.map(student => recordDetailRow(date, student.name, recordsByStudent.get(student.id)))]);
}

// 区间导出：明细只列区间内的异常记录（正常不写记录），末尾附按学生的次数汇总。
export function buildAttendanceRangeCsv(students: AppStudent[], records: AttendanceRecord[], from: string, to: string): string {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const inRange = records.filter(item => item.date >= start && item.date <= end);
  const studentById = new Map(students.map(student => [student.id, student]));
  const detailRows = [...inRange]
    .sort((a, b) => a.date.localeCompare(b.date) || (studentById.get(a.studentId)?.name || "").localeCompare(studentById.get(b.studentId)?.name || "", "zh-Hans-CN"))
    .map(item => recordDetailRow(item.date, studentById.get(item.studentId)?.name || "已移出学生", item));
  const summaryRows = students
    .map(student => {
      const own = inRange.filter(item => item.studentId === student.id);
      return {
        name: student.name,
        leave: own.filter(item => item.status === "leave").length,
        absent: own.filter(item => item.status === "absent").length,
        late: own.filter(item => item.late).length,
        earlyLeave: own.filter(item => item.earlyLeave).length,
      };
    })
    .filter(item => item.leave || item.absent || item.late || item.earlyLeave)
    .map(item => [item.name, String(item.leave), String(item.absent), String(item.late), String(item.earlyLeave)]);
  return toCsv([
    [`出勤明细（${start} 至 ${end}）`],
    DETAIL_HEADER,
    ...(detailRows.length ? detailRows : [["区间内没有出勤异常记录"]]),
    [],
    ["区间汇总（仅列出有记录的学生）"],
    ["姓名", "请假次数", "缺勤次数", "迟到次数", "早退次数"],
    ...summaryRows,
  ]);
}
