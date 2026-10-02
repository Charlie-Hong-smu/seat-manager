import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useRegistrationRetention } from "./useRegistrationRetention";

it("keeps edited identities stable until a deliberate query or domain change", () => {
  const view = renderHook(({ query }) => useRegistrationRetention(query), { initialProps: { query: "homework:h1:pending" } });
  act(() => { view.result.current.retainStudent("s1"); view.result.current.retainStudent("s2"); });
  expect([...view.result.current.retainedIds]).toEqual(["s1", "s2"]);
  act(() => view.result.current.clearRetention());
  expect(view.result.current.retainedIds.size).toBe(0);
  act(() => view.result.current.retainStudent("s1"));
  view.rerender({ query: "homework:h1:submitted" });
  expect(view.result.current.retainedIds.size).toBe(0);
  act(() => view.result.current.retainStudent("s3"));
  view.rerender({ query: "attendance:2026-10-01:submitted" });
  expect(view.result.current.retainedIds.size).toBe(0);
});
