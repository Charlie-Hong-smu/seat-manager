import { useState } from "react";
import { Check, ChevronDown, GraduationCap, Pencil, Plus, School, Trash2 } from "lucide-react";

import {
  advanceToNextTerm,
  composeClassNameByNumber,
  createClass,
  deleteSlice,
  getClassViews,
  getCurrentSlice,
  getLastSchoolStage,
  gradeLabelToNumber,
  gradeNumberToLabel,
  guessCurrentTerm,
  makeTerm,
  seasonLabel,
  setLastSchoolStage,
  sliceDisplayName,
  stageGradeOptions,
  stageLabel,
  switchSlice,
  updateClassInfo,
  type SchoolStage,
} from "../state/workspaces";
import { exportPreImportBackup } from "../state/backupStorage";
import type { TermSeason } from "../state/types";
import { AnimatedPopover, ConfirmDialog, useActionToast, useAppDialog } from "./ui";

interface Props {
  /** 切换/新建/删除等触碰文件柜前调用，App 用它同步 flush 防抖中的持久化。 */
  onBeforeMutate?: () => void;
  /** 切换 / 新建 / 升学期成功后回调,让上层重新加载当前班级数据。 */
  onChanged: () => void;
}

type Mode = "menu" | "newClass" | "nextTerm" | "editClass";

interface TermFormResult {
  className: string;
  stage: SchoolStage;
  gradeNumber: number;
  classNo: string;
  year: number;
  season: TermSeason;
  label: string;
}

function TermForm({
  title,
  confirmLabel,
  defaultName,
  showNameField,
  showTermField,
  initialStage,
  initialGrade,
  initialClassNo,
  initialTerm,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  defaultName?: string;
  showNameField: boolean;
  showTermField?: boolean;
  initialStage?: SchoolStage;
  initialGrade?: number;
  initialClassNo?: string;
  initialTerm?: { year: number; season: TermSeason };
  onCancel: () => void;
  onConfirm: (input: TermFormResult) => void;
}) {
  const guessed = guessCurrentTerm();
  const defaultTerm = initialTerm || guessed;
  const initStage = initialStage || getLastSchoolStage();
  const initGradeLabel = initialGrade ? gradeNumberToLabel(initialGrade) : "";
  const [className, setClassName] = useState(defaultName || (initStage && initialGrade ? composeClassNameByNumber(initStage, initialGrade, initialClassNo || "") : ""));
  const [year, setYear] = useState(defaultTerm.year);
  const [season, setSeason] = useState<TermSeason>(defaultTerm.season);
  const [customLabel, setCustomLabel] = useState("");
  const [stage, setStage] = useState<SchoolStage>(initStage);
  const [grade, setGrade] = useState(initGradeLabel);
  const [classNo, setClassNo] = useState(initialClassNo || "");
  const [nameEdited, setNameEdited] = useState(Boolean(defaultName));
  const showTerm = showTermField !== false;

  function refreshAutoName(nextStage: SchoolStage, nextGrade: string, nextNo: string) {
    if (nameEdited) {
      return;
    }
    const g = nextGrade.trim();
    setClassName(g ? composeClassNameByNumber(nextStage, gradeLabelToNumber(g), nextNo) : "");
  }
  function pickStage(next: SchoolStage) {
    setStage(next);
    setLastSchoolStage(next);
    setGrade("");
    refreshAutoName(next, "", classNo);
  }
  function pickGrade(nextGrade: string) {
    setGrade(nextGrade);
    refreshAutoName(stage, nextGrade, classNo);
  }
  function pickClassNo(nextNo: string) {
    const digits = nextNo.replace(/[^0-9]/g, "");
    setClassNo(digits);
    refreshAutoName(stage, grade, digits);
  }

  // 新建班级时:必须选了年级才能创建(班号可选)。
  const canCreate = !showNameField || Boolean(grade.trim() || className.trim());

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{title}</p>

      {showNameField && (
        <div className="space-y-2">
          <div>
            <span className="text-xs text-gray-500 mb-1 block">学段</span>
            <div className="flex gap-2">
              {(["primary", "junior", "senior"] as SchoolStage[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => pickStage(item)}
                  className={`flex-1 py-1.5 text-sm rounded-xl border transition-colors ${
                    stage === item ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {stageLabel(item)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-xs text-gray-500 mb-1 block">年级</span>
              <div className="flex flex-wrap gap-1.5">
                {stageGradeOptions(stage).map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => pickGrade(item)}
                    className={`px-2.5 py-1 text-sm rounded-lg border transition-colors ${
                      grade === item ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <label className="w-20">
              <span className="text-xs text-gray-500 mb-1 block">班号</span>
              <input
                value={classNo}
                onChange={e => pickClassNo(e.target.value)}
                inputMode="numeric"
                placeholder="如 3"
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">班级名称（可手动修改）</span>
            <input
              value={className}
              onChange={e => { setClassName(e.target.value); setNameEdited(true); }}
              placeholder="例如：高二(1)班"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400"
            />
          </label>
        </div>
      )}

      {showTerm && (
      <div>
        <span className="text-xs text-gray-500 mb-1 block">学期</span>
        <div className="flex gap-2 mb-2">
          {(["autumn", "spring", "custom"] as TermSeason[]).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setSeason(item)}
              className={`flex-1 py-1.5 text-sm rounded-xl border transition-colors ${
                season === item ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
              style={{ fontWeight: 600 }}
            >
              {seasonLabel(item)}
            </button>
          ))}
        </div>
        {season === "custom" ? (
          <input
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="自定义学期名，如：2024 暑期班"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400"
          />
        ) : (
          <label className="flex items-center gap-2">
            <span className="text-xs text-gray-500">学年</span>
            <input
              type="number"
              value={year}
              onChange={e => setYear(Number.parseInt(e.target.value, 10) || guessed.year)}
              className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400"
            />
            <span className="text-sm text-gray-500">年 {seasonLabel(season)}季</span>
          </label>
        )}
      </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          style={{ fontWeight: 600 }}
        >
          取消
        </button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => {
            if (!canCreate) {
              return;
            }
            onConfirm({
              className: className.trim(),
              stage,
              gradeNumber: grade.trim() ? gradeLabelToNumber(grade) : 0,
              classNo: classNo.trim(),
              year,
              season,
              label: season === "custom" ? customLabel.trim() : "",
            });
          }}
          className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function getNextTermDefault(current: { term: { year: number; season: TermSeason } }): { year: number; season: TermSeason } {
  if (current.term.season === "spring") {
    return { year: current.term.year, season: "autumn" };
  }
  if (current.term.season === "autumn") {
    return { year: current.term.year + 1, season: "spring" };
  }
  return guessCurrentTerm();
}

export function WorkspaceSwitcher({ onChanged, onBeforeMutate }: Props) {
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [pendingDeleteSlice, setPendingDeleteSlice] = useState<{ id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [, setRefreshKey] = useState(0);

  const current = getCurrentSlice();
  const classViews = getClassViews();

  function closeAll() {
    setOpen(false);
    setMode("menu");
    setEditingClassId(null);
  }

  function handleOpenEdit(classId: string) {
    setEditingClassId(classId);
    setMode("editClass");
  }

  function handleEditClass(input: TermFormResult) {
    if (!editingClassId) return;
    onBeforeMutate?.();
    const saved = updateClassInfo(editingClassId, {
      stage: input.stage,
      gradeNumber: input.gradeNumber || 1,
      classNo: input.classNo,
      customName: input.className,
    });
    if (!saved) { void appDialog.notice({ title: "保存班级信息失败", description: "本机数据没有改变。请检查浏览器存储空间后重试。" }); return; }
    setRefreshKey(k => k + 1);
    onChanged();
    actionToast.show({ message: "班级信息已保存" });
    closeAll();
  }

  function handleSwitch(sliceId: string) {
    if (sliceId === current.id) {
      closeAll();
      return;
    }
    onBeforeMutate?.();
    if (switchSlice(sliceId)) {
      onChanged();
      actionToast.show({ message: "已切换班级与学期" });
    } else {
      void appDialog.notice({ title: "切换失败", description: "本机数据没有改变。请检查浏览器存储空间后重试。" });
    }
    closeAll();
  }

  function handleCreateClass(input: TermFormResult) {
    onBeforeMutate?.();
    const term = makeTerm({ year: input.year, season: input.season, label: input.label });
    // 若用户手动填了与自动拼接不同的名字,作为 customName 传入。
    const auto = input.gradeNumber
      ? composeClassNameByNumber(input.stage, input.gradeNumber, input.classNo)
      : "";
    const customName = input.className && input.className !== auto ? input.className : undefined;
    const created = createClass({
      stage: input.stage,
      gradeNumber: input.gradeNumber || undefined,
      classNo: input.classNo || undefined,
      customName,
      className: input.className,
      term,
    });
    if (!created) { void appDialog.notice({ title: "创建班级失败", description: "本机数据没有改变。请先导出备份并检查浏览器存储空间。" }); return; }
    setRefreshKey(k => k + 1);
    onChanged();
    actionToast.show({ message: "班级已创建" });
    closeAll();
  }

  function handleNextTerm(input: TermFormResult) {
    onBeforeMutate?.();
    const term = makeTerm({ year: input.year, season: input.season, label: input.label });
    const created = advanceToNextTerm({ fromSliceId: current.id, term, copyRoster: true });
    if (!created) { void appDialog.notice({ title: "创建新学期失败", description: "本机数据没有改变。请先导出备份并检查浏览器存储空间。" }); return; }
    setRefreshKey(k => k + 1);
    onChanged();
    actionToast.show({ message: "新学期已创建并切换" });
    closeAll();
  }

  const currentName = sliceDisplayName(current);

  function handleDeleteSlice(sliceId: string) {
    onBeforeMutate?.();
    exportPreImportBackup();
    if (!deleteSlice(sliceId)) { setDeleteError("删除失败，本机数据未改变，请检查本机存储空间。"); return; }
    setPendingDeleteSlice(null);
    setRefreshKey(k => k + 1);
    // 如果删掉的是当前切片，重新加载（deleteSlice 会自动切换到第一个切片）
    onChanged();
    actionToast.show({ message: "学期已删除" });
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(v => !v); setMode("menu"); }}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
        style={{ fontWeight: 600 }}
      >
        <School className="w-3.5 h-3.5 text-blue-500" />
        <span className="max-w-48 truncate">{currentName}</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-500">{current.term.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && <div className="fixed inset-0 z-10" onClick={closeAll} />}
      <AnimatedPopover
        open={open}
        className="absolute left-0 top-full z-30 mt-1.5 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
      >
            {mode === "menu" && (
              <div className="max-h-[70vh] overflow-y-auto">
                <div className="p-2">
                  {classViews.map(view => (
                    <div key={view.classId} className="mb-1">
                      <div className="flex items-center gap-1 px-3 py-1.5">
                        <School className="w-3 h-3 text-gray-400" />
                        <span className="flex-1 text-xs text-gray-400 truncate" style={{ fontWeight: 700 }}>{view.className}</span>
                        <button
                          type="button"
                          aria-label={`编辑 ${view.className} 班级信息`}
                          onClick={e => { e.stopPropagation(); handleOpenEdit(view.classId); }}
                          className="p-1 text-gray-300 hover:text-blue-400 rounded-lg transition-colors"
                          title="编辑班级信息"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                      {view.slices
                        .slice()
                        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                        .map(slice => {
                          const displayName = sliceDisplayName(slice);
                          return (
                            <div
                              key={slice.id}
                              className={`group flex items-center gap-1 rounded-xl ${
                                slice.id === current.id ? "bg-blue-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <button
                                type="button"
                                aria-label={`删除 ${displayName} ${slice.term.label}`}
                                onClick={() => handleSwitch(slice.id)}
                                className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                  slice.id === current.id ? "text-blue-600" : "text-gray-600"
                                }`}
                              >
                                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                                <span className="flex-1 text-left">{displayName} · {slice.term.label}</span>
                                {slice.id === current.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteError(""); setPendingDeleteSlice({ id: slice.id, label: `${displayName} ${slice.term.label}` }); }}
                                className="opacity-0 group-hover:opacity-100 mr-2 p-1 text-gray-300 hover:text-red-400 rounded-lg transition-all"
                                title="删除这个学期"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 p-2 space-y-0.5">
                  <button
                    onClick={() => setMode("nextTerm")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-green-500" />
                    进入下一学期（当前班级）
                  </button>
                  <button
                    onClick={() => setMode("newClass")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-500" />
                    新建班级
                  </button>
                </div>
              </div>
            )}

            {mode === "newClass" && (
              <TermForm
                title="新建班级"
                confirmLabel="创建"
                showNameField
                onCancel={() => setMode("menu")}
                onConfirm={handleCreateClass}
              />
            )}

            {mode === "nextTerm" && (
              <TermForm
                title={`进入下一学期 · ${currentName}`}
                confirmLabel="创建新学期"
                showNameField={false}
                initialTerm={getNextTermDefault(current)}
                onCancel={() => setMode("menu")}
                onConfirm={handleNextTerm}
              />
            )}

            {mode === "editClass" && (() => {
              const editView = classViews.find(v => v.classId === editingClassId);
              const refSlice = editView?.slices[0];
              return (
                <TermForm
                  title={`编辑班级 · ${editView?.className || ""}`}
                  confirmLabel="保存"
                  showNameField
                  showTermField={false}
                  initialStage={refSlice?.stage}
                  initialGrade={refSlice?.gradeNumber}
                  initialClassNo={refSlice?.classNo}
                  defaultName={refSlice?.customName || ""}
                  onCancel={() => setMode("menu")}
                  onConfirm={handleEditClass}
                />
              );
            })()}
      </AnimatedPopover>
      <ConfirmDialog open={Boolean(pendingDeleteSlice)} title="删除这个学期？" description={`将删除“${pendingDeleteSlice?.label || "当前学期"}”的学生、成绩、出勤、任务及其他学期数据。删除前会自动导出安全备份，但此操作仍不可直接撤销。`} confirmLabel="确认删除学期" error={deleteError} onCancel={() => { setPendingDeleteSlice(null); setDeleteError(""); }} onConfirm={() => pendingDeleteSlice && handleDeleteSlice(pendingDeleteSlice.id)} />
      {appDialog.dialog}
      {actionToast.toast}
    </div>
  );
}
