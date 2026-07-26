import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestStudent } from "../state/testFixtures";
import { StudentPicker } from "./StudentPicker";

describe("StudentPicker", () => {
  it("finds a student by alias and returns the selected id", () => {
    const onChange = vi.fn();
    const students = [
      createTestStudent("s1", "张三"),
      { ...createTestStudent("s2", "李四"), aliases: ["小李"] },
    ];
    render(<StudentPicker compact students={students} value="s1" onChange={onChange} label="直接选择学生" />);

    fireEvent.click(screen.getByRole("button", { name: "直接选择学生" }));
    fireEvent.change(screen.getByPlaceholderText("搜索姓名或别名"), { target: { value: "小李" } });
    fireEvent.click(screen.getByRole("option", { name: "李四" }));

    expect(onChange).toHaveBeenCalledWith("s2");
  });
});
