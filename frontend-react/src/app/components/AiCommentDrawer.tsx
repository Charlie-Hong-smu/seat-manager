import { useState } from "react";
import { Copy, Sparkles, X } from "lucide-react";

import type { AppStudent } from "../state/types";

interface AiCommentDrawerProps {
  open: boolean;
  student: AppStudent;
  onClose: () => void;
}

function getDraftText(aiComments: unknown): string {
  if (!aiComments || typeof aiComments !== "object") {
    return "";
  }
  const draft = "draft" in aiComments ? (aiComments as { draft?: unknown }).draft : null;
  if (!draft || typeof draft !== "object") {
    return "";
  }
  const text = "text" in draft ? (draft as { text?: unknown }).text : "";
  return typeof text === "string" ? text : "";
}

export function AiCommentDrawer({ open, student, onClose }: AiCommentDrawerProps) {
  const draftText = getDraftText(student.aiComments);
  const [teacherNote, setTeacherNote] = useState("");
  const [draft, setDraft] = useState(draftText);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-md bg-white border-l border-gray-100 shadow-2xl flex flex-col">
      <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-violet-500 mb-0.5" style={{ fontWeight: 700 }}>AI 期末评语</div>
          <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 800 }}>{student.name}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>学生标签</div>
          <div className="flex flex-wrap gap-1.5">
            {[...student.academicTags, ...student.tags].slice(0, 8).map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full border border-gray-100 bg-white text-gray-600" style={{ fontWeight: 600 }}>
                {tag}
              </span>
            ))}
            {student.academicTags.length === 0 && student.tags.length === 0 && (
              <span className="text-sm text-gray-400">暂无标签</span>
            )}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>教师补充</span>
          <textarea
            value={teacherNote}
            onChange={event => setTeacherNote(event.target.value)}
            rows={4}
            className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-violet-300 resize-none"
            placeholder="补充学生近期表现、性格特点或需要强调的进步点。"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>评语草稿</span>
          <textarea
            rows={9}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-violet-300 resize-none"
            placeholder="在这里编辑当前学生的评语草稿。"
          />
        </label>
      </div>

      <div className="shrink-0 border-t border-gray-100 p-4 flex gap-2">
        <button
          onClick={() => {
            const note = teacherNote.trim() ? `，同时${teacherNote.trim()}` : "";
            setDraft(`${student.name}同学本学期态度认真，能积极参与课堂学习${note}。希望继续保持稳定的学习节奏，在薄弱环节上多做整理和复盘，争取取得更扎实的进步。`);
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm hover:bg-violet-700"
          style={{ fontWeight: 700 }}
        >
          <Sparkles className="w-4 h-4" />生成评语
        </button>
        <button
          onClick={() => {
            if (draft) navigator.clipboard.writeText(draft).catch(() => {});
          }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
