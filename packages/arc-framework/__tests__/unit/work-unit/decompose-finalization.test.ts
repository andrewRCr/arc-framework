import { describe, expect, it } from "vitest";

import {
  finalizeDecomposeRetirement,
} from "../../../src/lib/work-unit/decompose-finalization.js";

describe("retired v1/v2 decomposition finalization boundary", () => {
  it("refuses legacy evidence instead of emitting a generic receipt", async () => {
    expect(await finalizeDecomposeRetirement(
      {} as never,
      {} as never,
      "legacy-authority",
    )).toEqual({ status: "refused", reason: "unsupported-transition" });
  });
});
