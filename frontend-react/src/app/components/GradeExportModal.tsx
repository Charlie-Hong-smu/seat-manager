import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Printer, Search, X } from "lucide-react";
import { buildGradePrintPreviewHtml, exportGradeWorkbook, getDefaultGradeExportOptions } from "../state/gradeExport";
import type { AppStudent, GradeExam } from "../state/types";
import type { GradeExportContentKey, GradeExportOptions } from "../state/gradeExport";

interface GradeExportModalProps {
  exams: GradeExam[];
  students: AppStudent[];
  onClose: () => void;
}

const CONTENT_OPTIONS: Array<{ key: GradeExportContentKey; label: string }> = [
  { key: "rawScores", label: "原始成绩" },
  { key: "classStats", label: "班级统计" },
  { key: "classTrend", label: "班级趋势" },
  { key: "studentTrend", label: "学生个人趋势" },
  { key: "rankChanges", label: "排名变化" },
  { key: "distribution", label: "分数段分布" },
  { key: "missing", label: "缺考/无成绩记录" },
];

export function GradeExportModal({ exams, students, onClose }: GradeExportModalProps) {
  const defaultOptions = useMemo(() => getDefaultGradeExportOptions(exams), [exams]);
  const [options, setOptions] = useState<GradeExportOptions>(() => defaultOptions);
  const [studentSearch, setStudentSearch] = useState("");
  const [printHtml, setPrintHtml] = useState("");
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(exams.length ? "" : "暂无考试数据");
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim();
    return students.filter(student => {
      if (!keyword) return true;
      return [student.name, ...student.aliases].some(name => name.includes(keyword));
    });
  }, [studentSearch, students]);

  const selectedStudentCount = options.selectedStudentIds.length;
  const needsStudentSelection = options.object === "students" && selectedStudentCount === 0;

  function clearPreview() {
    setPrintHtml("");
    setErrorMessage("");
  }

  function update(patch: Partial<GradeExportOptions>) {
    clearPreview();
    setOptions(current => ({ ...current, ...patch }));
  }

  function updateContent(key: GradeExportContentKey, checked: boolean) {
    clearPreview();
    setOptions(current => ({
      ...current,
      contents: { ...current.contents, [key]: checked },
    }));
  }

  function toggleExam(examId: string) {
    clearPreview();
    setOptions(current => {
      const selected = new Set(current.selectedExamIds);
      if (selected.has(examId)) {
        selected.delete(examId);
      } else {
        selected.add(examId);
      }
      return { ...current, selectedExamIds: [...selected] };
    });
  }

  function toggleStudent(studentId: string) {
    clearPreview();
    setOptions(current => {
      const selected = new Set(current.selectedStudentIds);
      if (selected.has(studentId)) {
        selected.delete(studentId);
      } else {
        selected.add(studentId);
      }
      return { ...current, selectedStudentIds: [...selected] };
    });
  }

  function toggleAllStudents() {
    clearPreview();
    setOptions(current => ({
      ...current,
      selectedStudentIds: current.selectedStudentIds.length === students.length ? [] : students.map(student => student.id),
    }));
  }

  async function handleExport() {
    if (!exams.length || needsStudentSelection) {
      return;
    }
    setExporting(true);
    setErrorMessage("");
    try {
      await exportGradeWorkbook(exams, students, options);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message === "no_exams"
          ? "当前范围内没有可导出的考试。"
          : error instanceof Error && error.message === "no_students"
          ? "请先在上方学生列表勾选至少 1 名学生，或切换为全班汇总。"
          : "导出失败，请稍后重试。",
      );
    } finally {
      setExporting(false);
    }
  }

  function handlePrintPreview() {
    if (!exams.length || needsStudentSelection) {
      return;
    }
    try {
      setErrorMessage("");
      setPrintHtml(buildGradePrintPreviewHtml(exams, students, options));
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message === "no_exams"
          ? "当前范围内没有可预览的考试。"
          : error instanceof Error && error.message === "no_students"
          ? "请先在上方学生列表勾选至少 1 名学生，或切换为全班汇总。"
          : "打印预览生成失败，请稍后重试。",
      );
    }
  }

  function printPreview() {
    printFrameRef.current?.contentWindow?.focus();
    printFrameRef.current?.contentWindow?.print();
  }

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 px-4">
      <div className="modal-panel-enter flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <h3 className="text-base text-gray-900" style={{ fontWeight: 900 }}>成绩导出设置</h3>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            <section>
              <h4 className="mb-2 text-sm text-gray-800" style={{ fontWeight: 900 }}>导出对象</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update({ object: "class" })}
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${options.object === "class" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  style={{ fontWeight: 800 }}
                >
                  全班汇总
                </button>
                <button
                  onClick={() => {
                    clearPreview();
                    setOptions(current => ({
                      ...current,
                      object: "students",
                      selectedStudentIds: current.selectedStudentIds.length ? current.selectedStudentIds : students.map(student => student.id),
                    }));
                  }}
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${options.object === "students" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  style={{ fontWeight: 800 }}
                >
                  个人成绩
                </button>
              </div>
              {options.object === "students" && (
                <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                      <input
                        value={studentSearch}
                        onChange={event => setStudentSearch(event.target.value)}
                        placeholder="搜索学生姓名"
                        className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-300"
                      />
                    </div>
                    <button onClick={toggleAllStudents} className="h-9 rounded-xl bg-white px-3 text-xs text-blue-600 hover:bg-blue-50" style={{ fontWeight: 800 }}>
                      {selectedStudentCount === students.length ? "取消全选" : "全选"}
                    </button>
                  </div>
                  <div className={`mb-2 text-xs ${needsStudentSelection ? "text-red-500" : "text-gray-400"}`}>
                    已选择 {selectedStudentCount} 人
                    {needsStudentSelection && <span className="ml-2" style={{ fontWeight: 800 }}>请至少勾选 1 名学生</span>}
                  </div>
                  <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
                    {filteredStudents.map(student => (
                      <label key={student.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={options.selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudent(student.id)}
                          className="accent-blue-600"
                        />
                        <span className="truncate">{student.name}</span>
                        {student.gender && <span className="ml-auto text-xs text-gray-300">{student.gender}</span>}
                      </label>
                    ))}
                  </div>
                  {!filteredStudents.length && <div className="py-6 text-center text-sm text-gray-400">没有匹配的学生</div>}
                </div>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm text-gray-800" style={{ fontWeight: 900 }}>考试范围</h4>
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "全部考试"],
                  ["specific", "指定考试"],
                  ["date", "指定时间段"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => update({ range: value as GradeExportOptions["range"] })}
                    className={`h-9 rounded-xl border px-3 text-sm ${options.range === value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                    style={{ fontWeight: 800 }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {options.range === "specific" && (
                <div className="mt-3 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  {exams.map(exam => (
                    <label key={exam.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
                      <input type="checkbox" checked={options.selectedExamIds.includes(exam.id)} onChange={() => toggleExam(exam.id)} className="accent-blue-600" />
                      <span className="truncate">{exam.name} · {exam.date || "未填写日期"}</span>
                    </label>
                  ))}
                </div>
              )}

              {options.range === "date" && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <label className="flex items-center gap-2 text-sm text-gray-500">
                    开始日期
                    <input type="date" value={options.startDate} onChange={event => update({ startDate: event.target.value })} className="h-9 rounded-xl border border-gray-200 bg-white px-3 outline-none focus:border-blue-300" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-500">
                    结束日期
                    <input type="date" value={options.endDate} onChange={event => update({ endDate: event.target.value })} className="h-9 rounded-xl border border-gray-200 bg-white px-3 outline-none focus:border-blue-300" />
                  </label>
                </div>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm text-gray-800" style={{ fontWeight: 900 }}>导出内容</h4>
              <div className="grid grid-cols-2 gap-2">
                {CONTENT_OPTIONS.map(item => (
                  <label key={item.key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <input type="checkbox" checked={options.contents[item.key]} onChange={event => updateContent(item.key, event.target.checked)} className="accent-blue-600" />
                    {item.label}
                  </label>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
          {errorMessage && <p className="mr-auto text-xs text-red-500">{errorMessage}</p>}
          <button
            onClick={handleExport}
            disabled={exporting || !exams.length || needsStudentSelection}
            className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            style={{ fontWeight: 800 }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "导出中" : "Excel 工作簿"}
          </button>
          <button
            onClick={handlePrintPreview}
            disabled={!exams.length || needsStudentSelection}
            className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            style={{ fontWeight: 800 }}
          >
            <Printer className="h-4 w-4" />
            PDF/打印预览
          </button>
        </div>
      </div>

      {printHtml && (
        <div className="soft-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 px-4">
          <div className="modal-panel-enter flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base text-gray-900" style={{ fontWeight: 900 }}>PDF/打印预览</h3>
              <div className="flex items-center gap-2">
                <button onClick={printPreview} className="flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>
                  <Printer className="h-4 w-4" />
                  打印 / 另存为 PDF
                </button>
                <button onClick={() => setPrintHtml("")} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <iframe
              ref={printFrameRef}
              title="成绩打印预览"
              srcDoc={printHtml}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
