import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox, Input, Textarea } from "./ui";

afterEach(cleanup);

describe("BoardUI React 18 field adapters", () => {
  it("associates labels and hints, forwards the input ref and preserves string callbacks", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(<Input elementRef={ref} label="任务标题" hint="保存前可以继续修改" value="原始标题" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "任务标题" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAccessibleDescription("保存前可以继续修改");
    fireEvent.change(input, { target: { value: "家校沟通" } });
    expect(onChange).toHaveBeenCalledWith("家校沟通");
  });

  it("preserves textarea drafts and forwards readonly and disabled states to the control", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    const { rerender } = render(<Textarea elementRef={ref} label="评语草稿" value="待确认的草稿" onChange={onChange} />);
    const textarea = screen.getByRole("textbox", { name: "评语草稿" });
    expect(ref.current).toBe(textarea);
    fireEvent.change(textarea, { target: { value: "教师修改后的草稿" } });
    expect(onChange).toHaveBeenCalledWith("教师修改后的草稿");
    rerender(<Textarea label="评语草稿" value="教师修改后的草稿" isReadOnly />);
    expect(textarea).toHaveValue("教师修改后的草稿");
    expect(textarea).toHaveAttribute("readonly");
    rerender(<Textarea label="评语草稿" value="教师修改后的草稿" isDisabled />);
    expect(textarea).toBeDisabled();
  });

  it("passes boolean checkbox changes without changing the controlled selection", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox isSelected={false} onChange={onChange}>去重</Checkbox>);
    fireEvent.click(screen.getByRole("checkbox", { name: "去重" }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Checkbox isSelected onChange={onChange}>去重</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "去重" })).toBeChecked();
  });

  it("keeps native keyboard bubbling for drawer Escape while allowing explicit interception", () => {
    const parentKey = vi.fn();
    const { rerender } = render(<div onKeyDown={parentKey}><Input label="名称" onKeyDown={() => {}} /></div>);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(parentKey).toHaveBeenCalledOnce();
    parentKey.mockClear();
    rerender(<div onKeyDown={parentKey}><Input label="名称" onKeyDown={event => event.stopPropagation()} /></div>);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(parentKey).not.toHaveBeenCalled();
  });
});
