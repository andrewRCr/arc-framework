import { describe, expect, it } from "vitest";

import {
  V3ExtractionFinishResultSchema,
} from "../../../src/lib/work-unit/decompose-v3-finish.js";

describe("V3ExtractionFinishResultSchema", () => {
  it.each([
    { status: "previewed" },
    { status: "finished" },
    { status: "already-finished" },
    { status: "refused", reason: "destination-missing", locus: "member" },
  ])("accepts one canonical finish outcome: %o", (result) => {
    expect(V3ExtractionFinishResultSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    { status: "refused" },
    { status: "unknown" },
    { status: "previewed", reason: "unexpected" },
  ])("refuses an incomplete or open-ended outcome: %o", (result) => {
    expect(V3ExtractionFinishResultSchema.safeParse(result).success).toBe(false);
  });
});
