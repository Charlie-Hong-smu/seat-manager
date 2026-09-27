import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradesPage } from "./GradesPage";
import type { GradeExam } from "../state/types";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }));
afterEach(cleanup);

const chinese = [140, 120, 100, 80];
const geography = [95, 80, 65, 40];
const exam: GradeExam = {
  id: "mid",
  name: "期中考",
  date: "2026-09-27",
  subjects: ["语文", "地理"],
  rows: chinese.map((score, index) => ({
    id: `row-${index}`,
    name: `学生${index + 1}`,
    scores: { 语文: { score }, 地理: { score: geography[index] } },
    total: score + geography[index],
  })),
};

function renderPage(props: Partial<Parameters<typeof GradesPage>[0]> = {}) {
  return render(<GradesPage exams={[exam]} students={[]} onSelectStudent={vi.fn()} onOpenStudentFollowup={vi.fn()} {...props} />);
}

function selectSubject(subject: string) {
  fireEvent.click(within(screen.getByRole("group", { name: "成绩学科切换" })).getByRole("button", { name: subject }));
}

function gradeOf(name: string) {
  const cells = within(screen.getByText(name).closest("tr")!).getAllByRole("cell");
  return cells[cells.length - 2].textContent;
}

describe("grade thresholds and distribution", () => {
  it("grades a 150-point subject by score rate instead of treating every subject as 100 points", () => {
    renderPage();
    selectSubject("语文");
    expect(gradeOf("学生1")).toBe("优秀");
    expect(gradeOf("学生2")).toBe("良好");
    expect(gradeOf("学生3")).toBe("及格");
    expect(gradeOf("学生4")).toBe("不及格");
    const summary = screen.getByRole("list", { name: "分档人数" });
    const excellent = within(summary).getByText("优秀").closest("li")!;
    expect(within(excellent).getByLabelText("1人")).toBeInTheDocument();
    expect(within(excellent).getByLabelText("135")).toBeInTheDocument();
    expect(within(excellent).getByLabelText("25%")).toBeInTheDocument();
    const fail = within(summary).getByText("不及格").closest("li")!;
    expect(fail).toHaveTextContent("<");
    expect(within(fail).getByLabelText("1人")).toBeInTheDocument();
    expect(within(fail).getByLabelText("90")).toBeInTheDocument();
    expect(within(fail).getByLabelText("25%")).toBeInTheDocument();
    expect(screen.getByText("满分 150 · 每格 10 分")).toBeInTheDocument();
  });

  it("switches the distribution and table to rank tiers without changing the score-rate pass statistics", async () => {
    renderPage();
    selectSubject("语文");
    fireEvent.click(within(screen.getByRole("group", { name: "分档方式" })).getByRole("button", { name: "按名次" }));
    // 等级标签交叉淡化切换，等旧层退场后再断言。
    await waitFor(() => expect(gradeOf("学生1")).toBe("前10%"));
    expect(gradeOf("学生2")).toBe("前30%");
    expect(gradeOf("学生3")).toBe("中段");
    expect(gradeOf("学生4")).toBe("后20%");
    expect(screen.getByRole("columnheader", { name: "层次" })).toBeInTheDocument();
    expect(screen.getByLabelText("及格率 75%")).toBeInTheDocument();
  });

  it("lets the teacher set an independent total threshold and confirm subject full scores", () => {
    const onThresholdsChange = vi.fn();
    const onFullScoresChange = vi.fn(() => true);
    renderPage({ thresholds: { pass: 60, good: 75, excellent: 90 }, onThresholdsChange, onFullScoresChange });
    fireEvent.click(screen.getByRole("button", { name: "阈值设置" }));
    const panel = screen.getByRole("dialog", { name: "成绩阈值" });
    expect(panel).toHaveTextContent("满分 250");
    expect(panel).toHaveTextContent("沿用单科得分率：及格 150 · 良好 187.5 · 优秀 225");
    fireEvent.click(within(panel).getByRole("checkbox", { name: "单独设置" }));
    expect(onThresholdsChange).toHaveBeenLastCalledWith({ pass: 60, good: 75, excellent: 90, total: { pass: 60, good: 75, excellent: 90 } });

    const input = within(panel).getByRole("textbox", { name: "语文满分" });
    fireEvent.change(input, { target: { value: "160" } });
    fireEvent.blur(input);
    expect(onFullScoresChange).toHaveBeenCalledWith("mid", { 语文: 160, 地理: 100 });
  });

  it("reports when a legacy exam cannot store full scores", () => {
    renderPage({ onFullScoresChange: () => false });
    fireEvent.click(screen.getByRole("button", { name: "阈值设置" }));
    const input = screen.getByRole("textbox", { name: "地理满分" });
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("无法单独保存满分");
  });
});
