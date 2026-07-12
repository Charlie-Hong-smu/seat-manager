import { describe, expect, it } from "vitest";

import { EDITION_CAPABILITIES } from "./editionCapabilities";

describe("edition capabilities", () => {
  it("keeps early-access and internal tools out of Commercial", () => {
    expect(EDITION_CAPABILITIES.zhang).toMatchObject({
      earlyAccessChannel: true,
      personalTools: true,
      internalDiagnostics: true,
    });
    expect(EDITION_CAPABILITIES.commercial).toMatchObject({
      earlyAccessChannel: false,
      personalTools: false,
      internalDiagnostics: false,
    });
  });
});
