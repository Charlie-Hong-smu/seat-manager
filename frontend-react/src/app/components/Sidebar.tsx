import { useEffect, useState } from "react";
import {
  LayoutGrid, Upload, BarChart2, History,
  Shuffle, RotateCcw, Undo2, Plus, Search,
  Dices, FileUp, FileDown, Save, Trash2,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { createSavedGradeExamRecord, parseScoreFile } from "../state/scoreImport";
import type { AppStudent, Gender, GradeExam, SavedGradeExamRecord, ScoreImportDraft } from "../state/types";

type Tab = "common" | "import" | "scores" | "history";

interface Props {
  activeTab: Tab;
  students: AppStudent[];
  gradeExams: GradeExam[];
  canUndoSeatOrder: boolean;
  onRandomizeSeats: () => void;
  onOrderSeatsByList: () => void;
  onUndoSeatOrder: () => void;
  onAddStudent: (name: string, gender: Gender, alias?: string) => void;
  onSaveScoreImport: (record: SavedGradeExamRecord) => GradeExam | null;
  onTabChange: (tab: Tab) => void;
  onShowGrades: () => void;
  onHideGrades: () => void;
  mainView: "seat" | "grades";
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "common", label: "常用", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { key: "import", label: "导入备份", icon: <Upload className="w-3.5 h-3.5" /> },
  { key: "scores", label: "成绩", icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { key: "history", label: "历史", icon: <History className="w-3.5 h-3.5" /> },
];

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-50">
        <h3 className="text-gray-800" style={{ fontSize: "0.875rem", fontWeight: 700 }}>{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function RuleChip({ label, detail, type }: { label: string; detail: string; type: "must" | "soft" | "protect" }) {
  const colors = {
    must:    "bg-blue-50 border-blue-100 text-blue-700",
    soft:    "bg-emerald-50 border-emerald-100 text-emerald-700",
    protect: "bg-amber-50 border-amber-100 text-amber-700",
  };
  return (
    <div className={`rounded-xl border p-2.5 ${colors[type]}`}>
      <div className="text-xs" style={{ fontWeight: 700 }}>{label}</div>
      <div className="text-xs opacity-70 mt-0.5">{detail}</div>
    </div>
  );
}

// ── Tab: 常用 ─────────────────────────────────────────────────────────────────
function CommonTab({
  students,
  canUndoSeatOrder,
  onRandomizeSeats,
  onOrderSeatsByList,
  onUndoSeatOrder,
  onAddStudent,
}: {
  students: AppStudent[];
  canUndoSeatOrder: boolean;
  onRandomizeSeats: () => void;
  onOrderSeatsByList: () => void;
  onUndoSeatOrder: () => void;
  onAddStudent: (name: string, gender: Gender, alias?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentGender, setNewStudentGender] = useState<Gender>("");
  const [newStudentAlias, setNewStudentAlias] = useState("");
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [showConstraints, setShowConstraints] = useState(false);

  const filtered = students.filter(s => s.name.includes(search));

  function handleDraw() {
    const pool = students.map(s => s.name);
    const picked: string[] = [];
    const used = new Set<number>();
    for (let i = 0; i < drawCount && pool.length; i++) {
      let idx: number;
      do { idx = Math.floor(Math.random() * pool.length); } while (noRepeat && used.has(idx));
      used.add(idx);
      picked.push(pool[idx]);
    }
    setDrawResult(picked);
  }

  function handleAddStudent() {
    const name = newStudentName.trim();
    if (!name) {
      return;
    }
    onAddStudent(name, newStudentGender, newStudentAlias);
    setNewStudentName("");
    setNewStudentGender("");
    setNewStudentAlias("");
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 座位调整 */}
      <SectionCard title="座位调整" subtitle="固定 8 列，自动扩展行数">
        <div className="flex flex-col gap-2">
          <button onClick={onRandomizeSeats} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
            <Shuffle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />随机调整座位
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onOrderSeatsByList} className="py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-xs transition-colors" style={{ fontWeight: 600 }}>
              <RotateCcw className="w-3 h-3 inline mr-1 -mt-0.5" />按名单顺序
            </button>
            <button
              disabled={!canUndoSeatOrder}
              onClick={onUndoSeatOrder}
              className="py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-xs transition-colors disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-50"
              style={{ fontWeight: 600 }}
            >
              <Undo2 className="w-3 h-3 inline mr-1 -mt-0.5" />撤销上一步
            </button>
          </div>
          <div className="bg-blue-50/80 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-600">
            暂无明确要求，点击随机排座将按当前名单随机生成。
          </div>
        </div>

        {/* Rule chips */}
        <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600" style={{ fontWeight: 700 }}>排座要求</span>
            <span className="text-xs text-gray-400">随机排座时生效</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RuleChip label="避免同桌" detail="0 对" type="must" />
            <RuleChip label="前排照顾" detail="0 人" type="must" />
            <RuleChip label="座位保护" detail="未启用" type="protect" />
            <RuleChip label="男女搭配" detail="未启用" type="soft" />
          </div>
        </div>

        <button
          onClick={() => setShowConstraints(v => !v)}
          className="w-full mt-2 py-2 flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 bg-white hover:bg-gray-50 transition-colors"
          style={{ fontWeight: 600 }}
        >
          <span>编辑排座要求</span>
          {showConstraints ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {showConstraints && (
          <div className="mt-2 p-3 border border-gray-100 rounded-xl bg-gray-50 space-y-3">
            <p className="text-xs text-gray-400">先满足必须要求，再尽量照顾偏好。</p>
            {[
              { title: "同桌关系", note: "必须", placeholder1: "学生A", placeholder2: "学生B", btn: "添加同桌要求" },
              { title: "前排照顾", note: "必须", placeholder1: "需要坐前排的学生", placeholder2: "", btn: "添加前排学生" },
            ].map(g => (
              <div key={g.title} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="text-xs mb-2" style={{ fontWeight: 700, color: "#374151" }}>{g.title} <span className="text-blue-500 ml-1">{g.note}</span></div>
                <div className="flex gap-2">
                  <input className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-blue-300" placeholder={g.placeholder1} />
                  {g.placeholder2 && <input className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-blue-300" placeholder={g.placeholder2} />}
                  <button className="shrink-0 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs transition-colors" style={{ fontWeight: 600 }}>{g.btn}</button>
                </div>
              </div>
            ))}
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="text-xs mb-2" style={{ fontWeight: 700, color: "#374151" }}>男女搭配 <span className="text-emerald-500 ml-1">尽量</span></div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" className="accent-blue-600" />
                尽量男女同桌
              </label>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 学生 */}
      <SectionCard title="学生管理" subtitle="添加、搜索都在这里处理。">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
              placeholder="姓名"
              maxLength={20}
            />
            <select
              value={newStudentGender}
              onChange={e => setNewStudentGender(e.target.value as Gender)}
              className="px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 cursor-pointer"
            >
              <option value="">未知</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
            <button
              onClick={handleAddStudent}
              disabled={!newStudentName.trim()}
              className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <input
            value={newStudentAlias}
            onChange={e => setNewStudentAlias(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
            placeholder="别名/拼音（可选）"
          />
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
              placeholder="搜索学生"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {filtered.slice(0, 6).map(s => (
                <div key={s.id} className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center justify-between border-b border-gray-50 last:border-0 cursor-pointer">
                  <span>{s.name}</span>
                  <span className="text-xs text-gray-400">{s.gender}</span>
                </div>
              ))}
              {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">无匹配结果</div>}
            </div>
          )}
        </div>
      </SectionCard>

      {/* 抽签 */}
      <SectionCard title="抽签" subtitle="课堂抽问用，支持去重。">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              抽签人数
              <input
                type="number"
                min={1}
              max={Math.max(1, students.length)}
                value={drawCount}
                onChange={e => setDrawCount(Number(e.target.value))}
                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-blue-300 text-center"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer ml-auto">
              <input type="checkbox" checked={noRepeat} onChange={e => setNoRepeat(e.target.checked)} className="accent-blue-600" />
              去重
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDraw} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              <Dices className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />开始抽签
            </button>
            <button onClick={() => setDrawResult([])} className="px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              重置
            </button>
          </div>
          {drawResult.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100">
              {drawResult.map((name, i) => (
                <span key={i} className="px-2.5 py-1 bg-blue-600 text-white rounded-full text-sm" style={{ fontWeight: 600 }}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab: 导入备份 ─────────────────────────────────────────────────────────────
function ImportTab() {
  return (
    <div className="flex flex-col gap-3">
      {[
        {
          title: "导入名单",
          badge: "导入",
          badgeColor: "bg-blue-50 text-blue-600",
          desc: "支持 Excel/CSV；可选择是否覆盖现有名单",
          body: (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-blue-600" />覆盖现有名单
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-blue-600" />覆盖时保留历史数据
              </label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                <FileUp className="w-4 h-4 text-gray-300" />
                <span className="text-xs text-gray-400">点击选择文件 (.xlsx / .csv)</span>
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv" />
              </label>
              <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>导入名单</button>
            </div>
          ),
        },
        {
          title: "导出",
          badge: "导出",
          badgeColor: "bg-emerald-50 text-emerald-600",
          desc: "",
          body: (
            <div className="flex flex-col gap-2">
              <button className="w-full py-2 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
                <FileDown className="w-3.5 h-3.5" />导出座位表 CSV
              </button>
              <button className="w-full py-2 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
                <FileDown className="w-3.5 h-3.5" />导出备份 JSON
              </button>
              <p className="text-xs text-gray-400">上次备份：从未</p>
            </div>
          ),
        },
        {
          title: "恢复备份（JSON）",
          badge: "恢复",
          badgeColor: "bg-amber-50 text-amber-600",
          desc: "用于换电脑或恢复数据",
          body: (
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition-colors">
                <FileUp className="w-4 h-4 text-gray-300" />
                <span className="text-xs text-gray-400">选择 JSON 备份文件</span>
                <input type="file" className="hidden" accept=".json" />
              </label>
              <button className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>导入备份 JSON</button>
            </div>
          ),
        },
      ].map(card => (
        <div key={card.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between mb-1">
            <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{card.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${card.badgeColor}`} style={{ fontWeight: 600 }}>{card.badge}</span>
          </div>
          {card.desc && <p className="text-xs text-gray-400 mb-3">{card.desc}</p>}
          <div className="mt-3">{card.body}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: 成绩 ─────────────────────────────────────────────────────────────────
function ScoresTab({
  exams,
  onShowGrades,
  onSaveScoreImport,
}: {
  exams: GradeExam[];
  onShowGrades: () => void;
  onSaveScoreImport: (record: SavedGradeExamRecord) => GradeExam | null;
}) {
  const [selectedExam, setSelectedExam] = useState(exams[0]?.id || "");
  const selectedExamRecord = exams.find(exam => exam.id === selectedExam) || exams[0];
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<ScoreImportDraft | null>(null);
  const [scoreStatus, setScoreStatus] = useState("上传 .xlsx 或 .csv 后会自动解析。");
  const [scoreBusy, setScoreBusy] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (exams.length && !exams.some(exam => exam.id === selectedExam)) {
      setSelectedExam(exams[0].id);
    }
  }, [exams, selectedExam]);

  async function handleScoreFileChange(file?: File) {
    if (!file) {
      return;
    }
    setScoreBusy(true);
    setScoreDraft(null);
    setScoreStatus("正在解析成绩表...");
    try {
      const draft = await parseScoreFile(file);
      setScoreDraft(draft);
      setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
      setExamDate(new Date().toISOString().slice(0, 10));
      setShowSaveForm(true);
      setScoreStatus(`已解析 ${draft.entries.length} 名学生、${draft.subjects.length} 个科目。`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const message = {
        empty_file: "文件为空，无法解析。",
        unsupported_file: "暂不支持该文件格式，请使用 .xlsx、.xls、.csv 或 .tsv。",
        mapping_failed: "未识别到姓名列或科目列，请检查表头。",
        xlsx_unavailable: "Excel 解析库加载失败，请稍后重试。",
      }[reason] || "成绩表解析失败，请检查文件格式。";
      setScoreStatus(message);
    } finally {
      setScoreBusy(false);
    }
  }

  function handleSaveScoreDraft() {
    if (!scoreDraft) {
      setScoreStatus("请先上传并解析成绩表。");
      return;
    }
    const name = examName.trim();
    if (!name) {
      setScoreStatus("请填写考试名称。");
      return;
    }
    const saved = onSaveScoreImport(createSavedGradeExamRecord(scoreDraft, { name, date: examDate }));
    if (!saved) {
      setScoreStatus("保存失败，请稍后重试。");
      return;
    }
    setSelectedExam(saved.id);
    setScoreDraft(null);
    setShowSaveForm(false);
    setScoreStatus(`已保存「${saved.name}」，共 ${saved.rows.length} 名学生、${saved.subjects.length} 个科目。`);
    onShowGrades();
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="选择考试" subtitle="右侧看板会随选择更新。">
        <div className="flex flex-col gap-2">
          <select
            className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 cursor-pointer"
            value={selectedExam}
            onChange={e => setSelectedExam(e.target.value)}
          >
            {exams.map(e => (
              <option key={e.id} value={e.id}>{e.name} · {e.date || "未填写日期"}</option>
            ))}
          </select>
          <button
            onClick={onShowGrades}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors"
            style={{ fontWeight: 600 }}
          >
            <BarChart2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />查看成绩看板
          </button>
        </div>
      </SectionCard>

      <SectionCard title="查看科目" subtitle="选择总分或单科作为分析口径。">
        <div className="flex flex-col gap-2">
          <select className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 cursor-pointer">
            <option value="total">总分</option>
            {(selectedExamRecord?.subjects || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <details className="border border-gray-100 rounded-xl overflow-hidden">
            <summary className="px-3 py-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 flex justify-between items-center" style={{ fontWeight: 600, listStyle: "none" }}>
              <span>统计阈值</span><ChevronDown className="w-3 h-3" />
            </summary>
            <div className="p-3 bg-gray-50 flex gap-2">
              {[["及格", "60"], ["良好", "75"], ["优秀", "90"]].map(([label, val]) => (
                <label key={label} className="flex-1 flex flex-col gap-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <input type="number" defaultValue={val} className="px-2 py-1 text-sm text-center border border-gray-200 rounded-lg bg-white outline-none" />
                </label>
              ))}
            </div>
          </details>
        </div>
      </SectionCard>

      <SectionCard title="成绩导入" subtitle="解析成绩表后保存为一次考试。">
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
            <FileUp className="w-4 h-4 text-gray-300" />
            <span className="text-xs text-gray-400">{scoreBusy ? "正在解析..." : "点击上传成绩文件 (.xlsx / .csv)"}</span>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.tsv"
              onChange={event => {
                void handleScoreFileChange(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {scoreDraft && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              <div style={{ fontWeight: 700 }}>{scoreDraft.filename}</div>
              <div className="mt-1">{scoreDraft.entries.length} 名学生 · {scoreDraft.subjects.join("、")}</div>
              {scoreDraft.warnings.length > 0 && (
                <div className="mt-1 text-amber-600">{scoreDraft.warnings.join(" ")}</div>
              )}
            </div>
          )}
          <p className={`text-xs ${scoreDraft ? "text-blue-500" : "text-gray-400"}`}>{scoreStatus}</p>
        </div>
      </SectionCard>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <button
          onClick={() => setShowSaveForm(v => !v)}
          className="w-full flex items-center justify-between text-sm text-gray-700"
          style={{ fontWeight: 700 }}
        >
          <span>考试保存与管理</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showSaveForm ? "rotate-180" : ""}`} />
        </button>
        {showSaveForm && (
          <div className="mt-3 flex flex-col gap-2">
            <input
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none"
              placeholder="考试名称"
              maxLength={30}
              value={examName}
              onChange={event => setExamName(event.target.value)}
            />
            <input
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none"
              type="date"
              value={examDate}
              onChange={event => setExamDate(event.target.value)}
            />
            <button
              disabled={!scoreDraft || scoreBusy}
              onClick={handleSaveScoreDraft}
              className={`w-full py-2.5 rounded-xl text-sm transition-colors ${
                scoreDraft && !scoreBusy
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
              style={{ fontWeight: 600 }}
            >
              <Save className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />保存考试
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="text-sm text-gray-700 mb-3" style={{ fontWeight: 700 }}>历史考试</div>
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
          {exams.map(exam => (
            <button key={exam.id} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 transition-colors text-left">
              <div>
                <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{exam.name}</div>
                <div className="text-xs text-gray-400">{exam.date}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="text-sm text-gray-700 mb-3" style={{ fontWeight: 700 }}>分析与建议</div>
        <p className="text-xs text-gray-400 mb-3">班级分析显示在右侧；学生建议可在学生详情中查看。</p>
        <div className="flex flex-col gap-2">
          <button className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>生成班级分析</button>
          <button className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>生成学生建议</button>
          <button className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>评语工作台</button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: 历史 ─────────────────────────────────────────────────────────────────
function HistoryTab() {
  const mockHistory = [
    { id: 1, label: "2026-06-14 09:30", note: "周五调座后保存", count: 60 },
    { id: 2, label: "2026-05-20 14:10", note: "期中考试后调整", count: 60 },
    { id: 3, label: "2026-04-15 11:05", note: "第三次调座", count: 58 },
    { id: 4, label: "2026-03-10 09:45", note: "", count: 56 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="保存当前座位" subtitle="保存后可在历史列表中查看和恢复。">
        <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
          <Save className="w-3.5 h-3.5" />保存当前座位
        </button>
      </SectionCard>

      <SectionCard title="历史记录" subtitle="查看历史版本并按需恢复。">
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300" placeholder="搜索历史备注" />
        </div>
        <div className="space-y-2">
          {mockHistory.map(h => (
            <div key={h.id} className="border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{h.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{h.note || "无备注"} · {h.count} 人</div>
                </div>
                <button className="shrink-0 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors" style={{ fontWeight: 600 }}>恢复</button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────
export function Sidebar({
  activeTab,
  students,
  gradeExams,
  canUndoSeatOrder,
  onRandomizeSeats,
  onOrderSeatsByList,
  onUndoSeatOrder,
  onAddStudent,
  onSaveScoreImport,
  onTabChange,
  onShowGrades,
  onHideGrades,
  mainView,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100 w-80 shrink-0">
      {/* Tab Pills */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                onTabChange(tab.key);
                if (tab.key !== "scores" && mainView === "grades") onHideGrades();
              }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-all ${
                activeTab === tab.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontWeight: activeTab === tab.key ? 700 : 500 }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {activeTab === "common"  && (
          <CommonTab
            students={students}
            canUndoSeatOrder={canUndoSeatOrder}
            onRandomizeSeats={onRandomizeSeats}
            onOrderSeatsByList={onOrderSeatsByList}
            onUndoSeatOrder={onUndoSeatOrder}
            onAddStudent={onAddStudent}
          />
        )}
        {activeTab === "import"  && <ImportTab />}
        {activeTab === "scores"  && (
          <ScoresTab
            exams={gradeExams}
            onShowGrades={onShowGrades}
            onSaveScoreImport={onSaveScoreImport}
          />
        )}
        {activeTab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}
