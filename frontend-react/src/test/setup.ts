import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

beforeEach(() => {
  if (typeof window === "undefined") return; // workerd integration runs in Node, without DOM storage.
  window.localStorage.clear();
  window.sessionStorage.clear();
});
