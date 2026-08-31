import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog, IconButton, InlineStatus, useAppDialog } from "./ui";

afterEach(cleanup);

describe("IconButton semantic tones", () => {
  it("keeps standard controls unchanged and exposes compact add/delete actions accessibly", () => {
    const onAdd = vi.fn();
    render(<>
      <IconButton label="普通操作">图标</IconButton>
      <IconButton label="新增列" size="xs" tone="success" onClick={onAdd}>+</IconButton>
      <IconButton label="删除列" size="xs" tone="danger" disabled>−</IconButton>
    </>);
    expect(screen.getByRole("button", { name: "普通操作" })).toHaveClass("h-10", "text-gray-500");
    expect(screen.getByRole("button", { name: "新增列" })).toHaveClass("h-5", "text-emerald-600");
    fireEvent.click(screen.getByRole("button", { name: "新增列" }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "删除列" })).toHaveClass("text-red-500");
    expect(screen.getByRole("button", { name: "删除列" })).toBeDisabled();
  });
});

describe("ConfirmDialog", () => {
  it("portals the dialog to the document body so nested surfaces cannot offset or clip it", () => {
    const onConfirm = vi.fn();
    render(
      <div data-testid="nested-surface" style={{ transform: "translateY(20px)", overflow: "hidden" }}>
        <ConfirmDialog
          open
          title="确认操作？"
          description="确认弹窗应相对整个视口居中。"
          variant="primary"
          onCancel={() => {}}
          onConfirm={onConfirm}
        />
      </div>,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByTestId("nested-surface")).not.toContainElement(dialog);

    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("InlineStatus", () => {
  it("announces failures as alerts and completed work as status", () => {
    const { rerender } = render(<InlineStatus message="导入失败，请重试" />);
    expect(screen.getByRole("alert")).toHaveTextContent("导入失败");
    rerender(<InlineStatus message="名单已导入" />);
    expect(screen.getByRole("status")).toHaveTextContent("名单已导入");
  });
});

describe("shared prompt validation", () => {
  function PromptHarness({ onResult, validate }: { onResult: (value: string | null) => void; validate?: (value: string) => string | undefined }) {
    const dialog = useAppDialog();
    return <><button onClick={async () => onResult(await dialog.prompt({ title: "编辑名称", description: "", validate }))}>打开</button>{dialog.dialog}</>;
  }

  it("keeps invalid text open and waits until Chinese composition finishes", async () => {
    const onResult = vi.fn();
    render(<PromptHarness onResult={onResult} validate={value => value.trim() ? undefined : "请输入名称"} />);
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    const input = screen.getByRole("textbox", { name: "名称" });
    await new Promise(resolve => window.setTimeout(resolve, 10));
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onResult).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "第 7 组" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onResult).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("第 7 组"));
  });

  it("keeps existing callers without a validator unchanged", async () => {
    const onResult = vi.fn();
    render(<PromptHarness onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
  });
});
