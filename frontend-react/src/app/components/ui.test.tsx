import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionMenu, ConfirmDialog, DrawerDock, IconButton, InlineStatus, ModalHeader, ModalShell, NumberStepper, PanelSection, SegmentedControl, ToolDrawer, ToolPopover, useAppDialog } from "./ui";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("IconButton semantic tones", () => {
  it("uses unified controls and exposes compact add/delete actions accessibly", () => {
    const onAdd = vi.fn();
    render(<>
      <IconButton label="普通操作">图标</IconButton>
      <IconButton label="新增列" size="xs" tone="success" onClick={onAdd}>+</IconButton>
      <IconButton label="删除列" size="xs" tone="danger" disabled>−</IconButton>
    </>);
    expect(screen.getByRole("button", { name: "普通操作" })).toHaveClass("size-9", "text-text-primary");
    expect(screen.getByRole("button", { name: "新增列" })).toHaveClass("size-5", "text-status-success-600");
    fireEvent.click(screen.getByRole("button", { name: "新增列" }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "删除列" })).toHaveClass("text-status-danger-600");
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
    expect(dialog.closest(".dialog-presence")?.parentElement).toBe(document.body);
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


describe("BoardUI segmented compatibility", () => {
  it("keeps one pressed value and existing callbacks when selecting another option", () => {
    const onChange = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    const options = [{ value: "quick", label: "快速" }, { value: "detail", label: "详细" }];
    const { rerender } = render(<SegmentedControl value="quick" options={options} onChange={onChange} ariaLabel="登记视图" />);
    expect(screen.getByRole("group", { name: "登记视图" })).toBeVisible();
    expect(screen.getByRole("button", { name: "快速" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "详细" }));
    expect(onChange).toHaveBeenCalledWith("detail");
    rerender(<SegmentedControl value="detail" options={options} onChange={onChange} ariaLabel="登记视图" disabled />);
    expect(screen.getByRole("button", { name: "快速" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "详细" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "详细" })).toBeDisabled();
  });
});


describe("ToolDrawer presence", () => {
  it("keeps the closing surface inert, restores focus and handles reopening", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { rerender } = render(<ToolDrawer open title="测试抽屉" onClose={() => {}}>内容</ToolDrawer>);
    expect(screen.getByRole("complementary", { name: "测试抽屉" })).toBeVisible();
    rerender(<ToolDrawer open={false} title="测试抽屉" onClose={() => {}}>内容</ToolDrawer>);
    expect(trigger).toHaveFocus();
    expect(document.body.querySelector("aside")?.inert).toBe(true);
    expect(screen.queryByRole("complementary")).toBeNull();
    rerender(<ToolDrawer open title="测试抽屉" onClose={() => {}}>内容</ToolDrawer>);
    expect(document.body.querySelector("aside")?.inert).toBe(false);
    rerender(<ToolDrawer open={false} title="测试抽屉" onClose={() => {}}>内容</ToolDrawer>);
    await waitFor(() => expect(document.body.querySelector("aside")).toBeNull());
    trigger.remove();
  });
});

describe("shared modal exit motion", () => {
  it.each(["modal", "confirm"])("retains %s content while closing, blocks interaction and cancels stale exit timers", async kind => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const view = (open: boolean, title: string) => kind === "modal"
      ? <ModalShell open={open} title={title} onClose={() => {}}>原始内容</ModalShell>
      : <ConfirmDialog open={open} title={title} description="原始内容" onCancel={() => {}} onConfirm={() => {}} />;
    const { rerender } = render(view(true, "原始标题"));
    await waitFor(() => expect(document.querySelector(".dialog-presence")).toContainElement(document.activeElement as HTMLElement));
    rerender(view(false, "已清理标题"));
    const closing = document.querySelector<HTMLElement>(".dialog-presence")!;
    expect(closing.inert).toBe(true);
    expect(closing).toHaveAttribute("aria-hidden", "true");
    expect(closing).toHaveTextContent("原始标题");
    expect(closing).not.toHaveTextContent("已清理标题");
    expect(trigger).toHaveFocus();
    rerender(view(true, "重新打开"));
    expect(document.querySelector<HTMLElement>(".dialog-presence")?.inert).toBe(false);
    expect(screen.getByRole(kind === "modal" ? "dialog" : "alertdialog")).toHaveAccessibleName("重新打开");
    rerender(view(false, ""));
    await waitFor(() => expect(document.querySelector(".dialog-presence")).toBeNull());
    trigger.remove();
  });
});

describe("registration segment presses", () => {
  it("supports selected-option repeat presses without duplicate change callbacks", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const press = vi.fn(); const change = vi.fn();
    render(<SegmentedControl value="leave" ariaLabel="登记测试" onChange={change} onPress={press} options={[{ value: "normal", label: "正常" }, { value: "leave", label: "请假" }]}/>);
    fireEvent.click(screen.getByRole("button", { name: "请假" }));
    fireEvent.click(screen.getByRole("button", { name: "正常" }));
    expect(press.mock.calls).toEqual([["leave"], ["normal"]]);
    expect(change).not.toHaveBeenCalled();
  });
});

describe("toolbar action menu", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }));
  it("opens from the trigger, moves with arrow keys and runs the chosen action after returning focus", async () => {
    const onLayout = vi.fn();
    const onStudent = vi.fn();
    render(<ActionMenu label="管理" triggerId="manage" items={[
      { key: "student", label: "新增学生", onSelect: onStudent },
      { key: "layout", label: "编辑布局", onSelect: onLayout },
    ]} />);
    const trigger = screen.getByRole("button", { name: "管理" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "管理" });
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "编辑布局" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "新增学生" })).toHaveFocus();
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑布局" }));
    expect(onLayout).toHaveBeenCalledOnce();
    expect(onStudent).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape without running an action", () => {
    const onSelect = vi.fn();
    render(<ActionMenu label="管理" items={[{ key: "a", label: "新增学生", onSelect }]} />);
    const trigger = screen.getByRole("button", { name: "管理" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu", { name: "管理" }), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ToolPopover", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }));
  it("stays non-modal, ignores nested floating layers and closes on outside press or Escape", () => {
    const onClose = vi.fn();
    render(<>
      <button id="draw-anchor" type="button">抽签</button>
      <p>座位图</p>
      <div role="listbox" aria-label="嵌套下拉"><span>选项</span></div>
      <ToolPopover open title="课堂抽签" anchorId="draw-anchor" onClose={onClose}><button type="button">开始抽签</button></ToolPopover>
    </>);
    const dialog = screen.getByRole("dialog", { name: "课堂抽签" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(screen.getByText("座位图")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("button", { name: "开始抽签" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "抽签" }));
    fireEvent.mouseDown(screen.getByText("选项"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText("座位图"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "关闭工具面板" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps closed content inert and out of the accessibility tree", () => {
    render(<><button id="anchor" type="button">锚点</button><ToolPopover open={false} title="新增学生" anchorId="anchor" onClose={() => {}}><input aria-label="姓名" /></ToolPopover></>);
    expect(screen.queryByRole("dialog", { name: "新增学生" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "姓名" })).toBeNull();
  });
});

describe("NumberStepper", () => {
  it("steps within bounds and clamps typed values on commit", () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumberStepper value={1} min={1} max={3} ariaLabel="抽取人数" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "减少抽取人数" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "增加抽取人数" }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    const input = screen.getByRole("textbox", { name: "抽取人数" });
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(3);
    rerender(<NumberStepper value={3} min={1} max={3} ariaLabel="抽取人数" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "增加抽取人数" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("3");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});

describe("ToolDrawer docking", () => {
  afterEach(() => vi.restoreAllMocks());

  it("docks beside the workspace without a scrim and falls back to an overlay above dialogs", async () => {
    const rects = vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      return (this.id === "app-drawer-dock" ? [{}] : []) as unknown as DOMRectList;
    });
    const { rerender } = render(<><DrawerDock /><ToolDrawer open={false} title="班级职务" onClose={() => {}}>内容</ToolDrawer></>);
    rerender(<><DrawerDock /><ToolDrawer open title="班级职务" onClose={() => {}}>内容</ToolDrawer></>);
    const dock = document.getElementById("app-drawer-dock")!;
    const panel = screen.getByRole("complementary", { name: "班级职务" });
    expect(dock).toContainElement(panel);
    expect(dock).toHaveAttribute("data-open", "true");
    expect(document.querySelector(".tool-drawer-backdrop")).toBeNull();
    rerender(<><DrawerDock /><ToolDrawer open={false} title="班级职务" onClose={() => {}}>内容</ToolDrawer></>);
    await waitFor(() => expect(dock).toHaveAttribute("data-open", "false"));

    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay";
    document.body.append(overlay);
    rerender(<><DrawerDock /><ToolDrawer open title="快捷记录" onClose={() => {}}>内容</ToolDrawer></>);
    expect(dock).not.toContainElement(screen.getByRole("complementary", { name: "快捷记录" }));
    expect(document.querySelector(".tool-drawer-backdrop")).not.toBeNull();
    overlay.remove();
    rects.mockRestore();
  });
});


describe("ModalHeader", () => {
  it("links the title, runs the quiet close button and keeps actions in the identity band", () => {
    const onClose = vi.fn();
    render(<ModalHeader eyebrow="考试表格" title="期中考试" titleId="mh-title" description="60 名学生" actions={<button type="button">自定义操作</button>} closeLabel="关闭考试表格" onClose={onClose} />);

    expect(screen.getByText("期中考试").id).toBe("mh-title");
    expect(screen.getByText("考试表格")).toBeTruthy();
    expect(screen.getByText("自定义操作")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭考试表格" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("PanelSection", () => {
  it("renders a single bordered group with title, meta and action in one head row", () => {
    render(<PanelSection title="记录" meta="3 条" action={<button type="button">切换周</button>}><p>正文</p></PanelSection>);

    const section = document.querySelector(".panel-section");
    expect(section).not.toBeNull();
    expect(screen.getByText("记录")).toBeTruthy();
    expect(screen.getByText("3 条")).toBeTruthy();
    expect(screen.getByRole("button", { name: "切换周" })).toBeTruthy();
    expect(screen.getByText("正文")).toBeTruthy();
  });
});
