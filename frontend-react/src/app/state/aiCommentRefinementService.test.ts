import { beforeEach, describe, expect, it, vi } from "vitest";

import { refineCommentSelection, replaceCommentSelection } from "./aiCommentRefinementService";

describe("AI comment selection refinement", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("seat-manager-product-auth-token", "product-token");
    localStorage.setItem("seat-manager-product-auth-expires", String(Date.now() + 60_000));
    vi.restoreAllMocks();
  });

  it("replaces only the confirmed selection", () => {
    expect(replaceCommentSelection("学习认真，表达清楚。", 5, 9, "能够清楚表达自己的想法"))
      .toBe("学习认真，能够清楚表达自己的想法。");
    expect(replaceCommentSelection("原文", -1, 2, "替换")).toBe("原文");
  });

  it("requests a suggestion without persisting the draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ replacement: "能够清楚地说明解题思路。" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await refineCommentSelection({
      studentId: "s1",
      action: "polish",
      selectedText: "能说清楚解题过程",
      contextBefore: "在数学学习中，",
      contextAfter: "也愿意尝试不同方法。",
    });
    expect(result.replacement).toBe("能够清楚地说明解题思路。");
    expect(localStorage.getItem("seat-manager-ai-comment-draft:s1")).toBeNull();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      studentId: "s1",
      action: "polish",
      selectedText: "能说清楚解题过程",
    });
  });
});
