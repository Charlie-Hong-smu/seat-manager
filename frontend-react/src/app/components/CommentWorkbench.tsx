import { useState, useMemo } from "react";
import { X, Play, Pause, RotateCcw, Copy, Download, Search, CheckSquare, Square, ChevronRight, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { STUDENTS, EXAMS, Student, getBestSubject, getWeakSubject, getStudentExamScores } from "./mockData";

interface CommentState {
  studentId: number;
  text: string;
  generated: boolean;
  needsInfo: boolean;
  lengthMode: string;
  style: string;
}

function buildInitialComments(): CommentState[] {
  return STUDENTS.map(s => ({
    studentId: s.id,
    text: "",
    generated: false,
    needsInfo: s.academicTags.length === 0 && s.id % 8 === 0,
    lengthMode: "standard",
    style: "warm",
  }));
}

interface Props {
  onClose: () => void;
}

const LENGTH_MODES = [
  { value: "short",    label: "80～100 字" },
  { value: "standard", label: "100～150 字" },
  { value: "long",     label: "150～200 字" },
];

const STYLES = [
  { value: "warm",   label: "温和鼓励" },
  { value: "formal", label: "客观正式" },
  { value: "brief",  label: "简洁家长会" },
];

const MOCK_COMMENT = (name: string) =>
  `${name}同学在本学期表现出了积极进取的学习态度，课堂上认真听讲，能够主动参与课堂讨论。在学习过程中展现了较强的理解能力，成绩稳步提升。希望在新学期中继续保持这种学习热情，同时注重薄弱科目的巩固练习，相信你一定能取得更加优异的成绩。加油！`;

export function CommentWorkbench({ onClose }: Props) {
  const [comments, setComments] = useState<CommentState[]>(buildInitialComments);
  const [selectedId, setSelectedId] = useState<number>(STUDENTS[0].id);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterUngenerated, setFilterUngenerated] = useState(false);
  const [filterNeedsInfo, setFilterNeedsInfo] = useState(false);
  const [teacherNote, setTeacherNote] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const generatedCount = comments.filter(c => c.generated).length;
  const pendingCount = comments.filter(c => !c.generated).length;
  const needsInfoCount = comments.filter(c => c.needsInfo).length;

  const filteredStudents = useMemo(() => {
    return STUDENTS.filter(s => {
      const state = comments.find(c => c.studentId === s.id)!;
      if (filterSearch && !s.name.includes(filterSearch)) return false;
      if (filterUngenerated && state.generated) return false;
      if (filterNeedsInfo && !state.needsInfo) return false;
      return true;
    });
  }, [comments, filterSearch, filterUngenerated, filterNeedsInfo]);

  const selectedStudent = STUDENTS.find(s => s.id === selectedId)!;
  const selectedComment = comments.find(c => c.studentId === selectedId)!;
  const examScores = getStudentExamScores(selectedId);
  const latestExam = examScores[0];

  function updateComment(id: number, patch: Partial<CommentState>) {
    setComments(prev => prev.map(c => c.studentId === id ? { ...c, ...patch } : c));
  }

  function generateSingle() {
    const text = MOCK_COMMENT(selectedStudent.name);
    updateComment(selectedId, { text, generated: true });
  }

  function startBatch() {
    setBatchRunning(true);
    setBatchProgress(0);
    const pending = comments.filter(c => !c.generated);
    let i = 0;
    const interval = setInterval(() => {
      if (i >= pending.length) {
        clearInterval(interval);
        setBatchRunning(false);
        return;
      }
      const student = STUDENTS.find(s => s.id === pending[i].studentId)!;
      updateComment(pending[i].studentId, {
        text: MOCK_COMMENT(student.name),
        generated: true,
      });
      i++;
      setBatchProgress(Math.round((i / pending.length) * 100));
    }, 180);
  }

  function pauseBatch() {
    setBatchRunning(false);
  }

  function copyAll() {
    const text = comments
      .filter(c => c.generated)
      .map(c => {
        const s = STUDENTS.find(st => st.id === c.studentId)!;
        return `【${s.name}】\n${c.text}`;
      })
      .join("\n\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const tagSummary = (s: Student) =>
    s.academicTags.length > 0 ? s.academicTags.slice(0, 2).join("、") : "暂无标签";

  const scoreSummary = (id: number) => {
    const exams = getStudentExamScores(id);
    if (!exams.length) return "暂无成绩";
    const e = exams[0];
    return `${e.exam.name}成绩·总…`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-0.5" style={{ fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>全班评语管理</div>
          <h2 className="text-gray-900">评语工作台</h2>
        </div>

        {/* Progress metrics */}
        <div className="flex items-center gap-5">
          {[
            { label: "学生", value: STUDENTS.length, color: "text-gray-700" },
            { label: "已生成", value: generatedCount, color: "text-emerald-600" },
            { label: "待生成", value: pendingCount, color: "text-blue-600" },
            { label: "需补充", value: needsInfoCount, color: "text-amber-600" },
          ].map(m => (
            <div key={m.label} className="text-center">
              <div className={`text-lg ${m.color}`} style={{ fontWeight: 800, lineHeight: 1 }}>{m.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors ml-auto">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={batchRunning ? pauseBatch : startBatch}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors ${batchRunning ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          style={{ fontWeight: 600 }}
        >
          {batchRunning ? <><Pause className="w-3.5 h-3.5" />暂停</> : <><Play className="w-3.5 h-3.5" />批量生成</>}
        </button>
        <button onClick={() => setComments(buildInitialComments())} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
          <RotateCcw className="w-3.5 h-3.5" />重置
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="搜索学生"
            className="pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 w-36"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterUngenerated} onChange={e => setFilterUngenerated(e.target.checked)} className="accent-blue-600" />
          只看未生成
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterNeedsInfo} onChange={e => setFilterNeedsInfo(e.target.checked)} className="accent-blue-600" />
          只看需补充
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
            <Copy className="w-3.5 h-3.5" />复制全部
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
            <Download className="w-3.5 h-3.5" />导出评语
          </button>
        </div>

        {/* Progress bar */}
        {(batchRunning || batchProgress > 0) && (
          <div className="w-full flex items-center gap-3 pt-1">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${batchProgress}%` }} />
            </div>
            <span className="text-xs text-gray-500 shrink-0">{batchProgress}% · {generatedCount}/{STUDENTS.length} 已生成</span>
          </div>
        )}
      </div>

      {/* Main Layout */}
      <div className="flex-1 min-h-0 flex gap-0">
        {/* Left: Student Table */}
        <div className="w-[55%] flex flex-col min-h-0 border-r border-gray-100">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
            <h3 className="text-gray-700" style={{ fontSize: "0.875rem" }}>学生评语表格</h3>
            <span className="text-xs text-gray-400">{filteredStudents.length} 人</span>
          </div>

          {/* Table header */}
          <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-400" style={{ fontWeight: 700 }}>
            <div className="col-span-1">选择</div>
            <div className="col-span-2">学生</div>
            <div className="col-span-2">标签</div>
            <div className="col-span-3">成绩摘要</div>
            <div className="col-span-1">完整度</div>
            <div className="col-span-2">状态</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table rows */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredStudents.map(s => {
              const state = comments.find(c => c.studentId === s.id)!;
              const isSelected = s.id === selectedId;
              const integrity = s.academicTags.length > 0 ? 40 : 20;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-gray-50 text-left hover:bg-blue-50/40 transition-colors items-center ${isSelected ? "bg-blue-50 border-b-blue-100" : ""}`}
                >
                  <div className="col-span-1">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                  </div>
                  <div className="col-span-2 text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="col-span-2 text-xs text-gray-500 truncate">{tagSummary(s)}</div>
                  <div className="col-span-3 text-xs text-gray-400 truncate">{scoreSummary(s.id)}</div>
                  <div className="col-span-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${integrity >= 40 ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${integrity}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{integrity}%</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    {state.needsInfo ? (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-full" style={{ fontWeight: 600 }}>需补充</span>
                    ) : state.generated ? (
                      <span className="text-xs px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full" style={{ fontWeight: 600 }}>已生成</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-full" style={{ fontWeight: 600 }}>可生成</span>
                    )}
                  </div>
                  <div className="col-span-1 text-xs text-gray-400">{LENGTH_MODES.find(m => m.value === state.lengthMode)?.label?.split("～")[0]}～字</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <div className="text-xs text-gray-400" style={{ fontWeight: 600 }}>当前学生</div>
              <h3 className="text-gray-800" style={{ fontSize: "0.9375rem" }}>
                {selectedStudent.name}
                <span className="text-gray-400 ml-2" style={{ fontWeight: 400, fontSize: "0.8125rem" }}>· 评语资料</span>
              </h3>
              <div className="text-xs mt-0.5">
                {selectedComment.generated
                  ? <span className="text-emerald-600">已生成</span>
                  : selectedComment.needsInfo
                  ? <span className="text-amber-600">需要补充信息</span>
                  : <span className="text-blue-600">可生成 · 尚未生成</span>}
              </div>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
              查看详情 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
            {/* Score summary */}
            {latestExam && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>成绩摘要</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">最近考试</span>
                    <span className="text-gray-700" style={{ fontWeight: 600 }}>{latestExam.exam.name} · {latestExam.exam.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">总分</span>
                    <span className="text-blue-700" style={{ fontWeight: 800 }}>{latestExam.score.total}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">排名</span>
                    <span style={{ fontWeight: 600 }}>第 {latestExam.score.classRank} 名</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-700" style={{ fontWeight: 600 }}>
                      {getBestSubject(latestExam.score.scores)}
                    </span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-400 ml-1" />
                    <span className="text-red-500" style={{ fontWeight: 600 }}>
                      {getWeakSubject(latestExam.score.scores)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>已有学生标签</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedStudent.academicTags.length > 0 ? selectedStudent.academicTags.map(tag => {
                  const isStrong = tag.endsWith("强");
                  return (
                    <span key={tag} className={`text-xs px-2.5 py-1 rounded-full border ${isStrong ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-400 border-red-100"}`} style={{ fontWeight: 600 }}>
                      {tag}
                    </span>
                  );
                }) : <span className="text-xs text-gray-400">暂无标签</span>}
              </div>
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>字数设置</span>
                <select
                  value={selectedComment.lengthMode}
                  onChange={e => updateComment(selectedId, { lengthMode: e.target.value })}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none cursor-pointer"
                >
                  {LENGTH_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>评语风格</span>
                <select
                  value={selectedComment.style}
                  onChange={e => updateComment(selectedId, { style: e.target.value })}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none cursor-pointer"
                >
                  {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* Teacher note */}
            <div>
              <div className="text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>老师补充评价</div>
              <textarea
                value={teacherNote}
                onChange={e => setTeacherNote(e.target.value)}
                rows={3}
                placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。"
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none"
              />
            </div>

            {/* Generated result */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-gray-500" style={{ fontWeight: 700 }}>AI 生成结果</div>
                <span className="text-xs text-gray-400">{selectedComment.text.length} 字</span>
              </div>
              <textarea
                value={selectedComment.text}
                onChange={e => updateComment(selectedId, { text: e.target.value })}
                rows={7}
                placeholder="点击「单独生成」后会在这里显示评语，可直接编辑。"
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={generateSingle}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Sparkles className="w-4 h-4" />
                {selectedComment.generated ? "重新生成" : "单独生成"}
              </button>
              <button
                onClick={() => {
                  if (selectedComment.text) {
                    navigator.clipboard.writeText(selectedComment.text).catch(() => {});
                  }
                }}
                disabled={!selectedComment.generated}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors disabled:opacity-40"
                style={{ fontWeight: 600 }}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
