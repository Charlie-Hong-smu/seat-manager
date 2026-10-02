import { afterEach, expect, it } from "vitest";
import { hasCachedDrafts } from "./useCloudSync";
afterEach(() => { document.body.innerHTML = ""; });
it("closed shared date pickers and layouts do not count as active drafts", () => {
  document.body.innerHTML = '<div aria-hidden="true" inert><div role="dialog" aria-label="截止日期"></div><div data-seat-layout-editor></div></div>';
  expect(hasCachedDrafts()).toBe(false);
  document.body.firstElementChild!.removeAttribute("aria-hidden"); document.body.firstElementChild!.removeAttribute("inert");
  expect(hasCachedDrafts()).toBe(true);
});
it("the sync review dialog is excluded while other visible dialogs protect active edits", () => {
  document.body.innerHTML = '<div role="dialog"><div data-cloud-sync></div></div>';
  expect(hasCachedDrafts()).toBe(false);
  document.body.insertAdjacentHTML("beforeend", '<div role="alertdialog"></div>'); expect(hasCachedDrafts()).toBe(true);
});
