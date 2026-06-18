import { BarChart2, LayoutGrid } from "lucide-react";

interface MainTabsProps {
  activeView: "seat" | "grades";
  onChangeView: (view: "seat" | "grades") => void;
  onOpenCommentWorkbench: () => void;
}

export function MainTabs({ activeView, onChangeView, onOpenCommentWorkbench }: MainTabsProps) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white">
      <button
        onClick={() => onChangeView("seat")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${activeView === "seat" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
        style={{ fontWeight: 600 }}
      >
        <LayoutGrid className="w-3.5 h-3.5" />座位布局
      </button>
      <button
        onClick={() => onChangeView("grades")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${activeView === "grades" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
        style={{ fontWeight: 600 }}
      >
        <BarChart2 className="w-3.5 h-3.5" />成绩看板
      </button>

      <button
        onClick={onOpenCommentWorkbench}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-violet-600 border border-violet-200 hover:bg-violet-50 transition-colors"
        style={{ fontWeight: 600 }}
      >
        评语工作台
      </button>
    </div>
  );
}
