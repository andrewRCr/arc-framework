import { describe, expect, it } from "vitest";

import {
  parseDecomposePreparationRecord,
  prepareDecomposeRetirement,
} from "../../../src/lib/work-unit/decompose-preparation.js";

describe("retired v1/v2 decomposition preparation boundary", () => {
  it("refuses legacy evidence instead of manufacturing v3 authority", async () => {
    expect(parseDecomposePreparationRecord("{}")).toBeNull();
    expect(await prepareDecomposeRetirement(
      {} as never,
      {} as never,
      {} as never,
      "legacy-authority",
    )).toEqual({ status: "refused", reason: "unsupported-transition" });
  });
});
