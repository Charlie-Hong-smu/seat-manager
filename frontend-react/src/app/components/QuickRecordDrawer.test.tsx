import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickRecordDrawer } from "./QuickRecordDrawer";
import { createTestStudent } from "../state/testFixtures";
import type { AppStudent, QuickRecordPreset } from "../state/types";

const students: AppStudent[] = [createTestStudent("s1", "合成学生")];
const presets: QuickRecordPreset[] = [{ id: "p1", label: "主动回答", type: "reward", note: "主动回答课堂问题", enabled: true, order: 0 }];
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("classroom quick record", () => {
  it("keeps general drafts separate, submits a bound student once, and preserves undo", () => {
    const undo = vi.fn();
    const onApply = vi.fn(() => undo);
    const props = { open: true, students, presets, onClose: vi.fn(), onApply, onPresetsChange: vi.fn() };
    const view = render(<QuickRecordDrawer key="general" {...props} />);
    fireEvent.change(screen.getByPlaceholderText("记录客观事实"), { target: { value: "多人未保存草稿" } });
    view.rerender(<QuickRecordDrawer key="seat" {...props} initialStudentIds={["s1"]} />);
    expect(screen.getByPlaceholderText("记录客观事实")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "主动回答" }));
    const save = screen.getByRole("button", { name: "保存到 合成学生" });
    fireEvent.click(save); fireEvent.click(save);
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ studentIds: ["s1"], type: "reward", note: "主动回答课堂问题", score: undefined, presetId: "p1" });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(undo).toHaveBeenCalledOnce();
    view.rerender(<QuickRecordDrawer key="general" {...props} />);
    expect(screen.getByPlaceholderText("记录客观事实")).toHaveValue("多人未保存草稿");
  });

  it("retains facts after a failed save and allows an explicit retry", () => {
    const onApply = vi.fn().mockReturnValueOnce(false).mockReturnValue(() => {});
    render(<QuickRecordDrawer open students={students} presets={presets} initialStudentIds={["s1"]} onClose={() => {}} onApply={onApply} onPresetsChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("记录客观事实"), { target: { value: "尚未保存的客观事实" } });
    const save = screen.getByRole("button", { name: "保存到 合成学生" });
    fireEvent.click(save);
    expect(screen.getByRole("alert")).toHaveTextContent("记录没有保存");
    expect(screen.getByPlaceholderText("记录客观事实")).toHaveValue("尚未保存的客观事实");
    fireEvent.click(save);
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(screen.getByPlaceholderText("记录客观事实")).toHaveValue("");
    expect(save).toBeDisabled();
  });
});
