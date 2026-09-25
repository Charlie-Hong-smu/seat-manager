import { useId, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Printer, Search } from "lucide-react";
import { buildGradePrintPreviewHtml, exportGradeWorkbook, getDefaultGradeExportOptions } from "../state/gradeExport";
import type { AppStudent, GradeExam } from "../state/types";
import type { GradeExportContentKey, GradeExportOptions } from "../state/gradeExport";
import { matchesStudentSearch } from "../state/studentSearch";
import { Button, Checkbox, DatePicker, Input, ModalHeader, MotionCollapse, MotionSwitch, SegmentedControl, useModalFocus } from "./ui";

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
  const titleId = useId();
  const panelRef = useModalFocus(true, onClose);
  const previewRef = useModalFocus(Boolean(printHtml), () => setPrintHtml(""));

  const filteredStudents = useMemo(() => {
    return students.filter(student => matchesStudentSearch(student, studentSearch));
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
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel-enter app-modal-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden outline-none">
        <ModalHeader icon={<FileSpreadsheet className="h-4 w-4" />} title="成绩导出设置" titleId={titleId} closeLabel="关闭成绩导出" onClose={onClose} />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
            <section>
              <h4 className="mb-2 text-body-semibold text-text-primary">导出对象</h4>
              <SegmentedControl value={options.object} ariaLabel="导出对象" className="flex w-full" options={[{ value: "class", label: "全班汇总" }, { value: "students", label: "个人成绩" }]} onChange={value => {
                if (value === "class") { update({ object: "class" }); return; }
                clearPreview();
                setOptions(current => ({ ...current, object: "students", selectedStudentIds: current.selectedStudentIds.length ? current.selectedStudentIds : students.map(student => student.id) }));
              }} />
              <MotionCollapse open={options.object === "students"}>
                <div className="mt-3 rounded-[var(--app-radius-md)] border border-separator-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Input value={studentSearch} onChange={setStudentSearch} leadingIcon={Search} placeholder="搜索学生姓名" className="min-w-0 flex-1" />
                    <Button size="sm" variant="quiet" onClick={toggleAllStudents}>{selectedStudentCount === students.length ? "取消全选" : "全选"}</Button>
                  </div>
                  <div className={`mb-2 text-caption-1-regular ${needsStudentSelection ? "text-status-danger-600" : "text-text-tertiary"}`}>
                    已选择 {selectedStudentCount} 人{needsStudentSelection && <span className="ml-2 font-semibold">请至少勾选 1 名学生</span>}
                  </div>
                  <div className="grid max-h-48 grid-cols-2 gap-x-3 gap-y-2 overflow-y-auto px-1 py-0.5">
                    {filteredStudents.map(student => (
                      <Checkbox key={student.id} isSelected={options.selectedStudentIds.includes(student.id)} onChange={() => toggleStudent(student.id)}>
                        {student.name}{student.gender && <span className="ml-1.5 text-caption-1-regular text-text-tertiary">{student.gender}</span>}
                      </Checkbox>
                    ))}
                  </div>
                  {!filteredStudents.length && <div className="py-6 text-center text-body-regular text-text-tertiary">没有匹配的学生</div>}
                </div>
              </MotionCollapse>
            </section>

            <section>
              <h4 className="mb-2 text-body-semibold text-text-primary">考试范围</h4>
              <SegmentedControl value={options.range} ariaLabel="考试范围" className="flex w-full" options={[{ value: "all", label: "全部考试" }, { value: "specific", label: "指定考试" }, { value: "date", label: "指定时间段" }]} onChange={value => update({ range: value as GradeExportOptions["range"] })} />

              <MotionSwitch transitionKey={options.range}>
              {options.range === "specific" && (
                <div className="mt-3 grid max-h-44 grid-cols-2 gap-x-3 gap-y-2 overflow-y-auto rounded-[var(--app-radius-md)] border border-separator-border p-3">
                  {exams.map(exam => (
                    <Checkbox key={exam.id} isSelected={options.selectedExamIds.includes(exam.id)} onChange={() => toggleExam(exam.id)}>
                      <span className="truncate">{exam.name} · {exam.date || "未填写日期"}</span>
                    </Checkbox>
                  ))}
                </div>
              )}

              {options.range === "date" && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-[var(--app-radius-md)] border border-separator-border p-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-caption-1-medium text-text-secondary">
                    开始日期
                    <DatePicker value={options.startDate} onChange={startDate => update({ startDate })} ariaLabel="导出开始日期" className="w-full" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-caption-1-medium text-text-secondary">
                    结束日期
                    <DatePicker value={options.endDate} onChange={endDate => update({ endDate })} ariaLabel="导出结束日期" className="w-full" min={options.startDate} />
                  </label>
                </div>
              )}
              </MotionSwitch>
            </section>

            <section>
              <h4 className="mb-2 text-body-semibold text-text-primary">导出内容</h4>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-[var(--app-radius-md)] border border-separator-border p-3 sm:grid-cols-3">
                {CONTENT_OPTIONS.map(item => (
                  <Checkbox key={item.key} isSelected={options.contents[item.key]} onChange={checked => updateContent(item.key, checked)}>{item.label}</Checkbox>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="app-modal-footer flex items-center justify-end gap-2 px-5 py-3.5">
          {errorMessage && <p role="alert" className="mr-auto text-caption-1-regular text-status-danger-600">{errorMessage}</p>}
          <Button variant="secondary" onClick={() => void handleExport()} disabled={exporting || !exams.length || needsStudentSelection}>
            <FileSpreadsheet className="h-4 w-4" />{exporting ? "导出中" : "Excel 工作簿"}
          </Button>
          <Button onClick={handlePrintPreview} disabled={!exams.length || needsStudentSelection}>
            <Printer className="h-4 w-4" />PDF/打印预览
          </Button>
        </div>
      </div>

      {printHtml && (
        <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div ref={previewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="PDF/打印预览" className="outline-none modal-panel-enter app-modal-panel flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden">
            <ModalHeader title="PDF/打印预览" closeLabel="关闭打印预览" onClose={() => setPrintHtml("")} actions={<Button size="sm" onClick={printPreview}><Printer className="h-4 w-4" />打印 / 另存为 PDF</Button>} />
            <iframe
              ref={printFrameRef}
              title="成绩打印预览"
              srcDoc={printHtml}
              className="min-h-0 flex-1 border-0 bg-background-primary-default"
            />
          </div>
        </div>
      )}
    </div>
  );
}
