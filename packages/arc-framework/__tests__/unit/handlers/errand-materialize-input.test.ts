/** Generation-guard input contract for Errand materialization. */

import { describe, expect, it } from "vitest";

import { ErrandMaterializeInputSchema } from "../../../src/handlers/errand.js";

const claimId = "c".repeat(32);
const expectedHead = "a".repeat(40);

describe("Errand materialize input", () => {
  it.each([
    { slug: "fix-output" },
    { slug: "fix-output", claimId, expectedHead },
  ])("accepts an absent guard or a complete generation guard", (input) => {
    expect(ErrandMaterializeInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { slug: "fix-output", claimId },
    { slug: "fix-output", expectedHead },
  ])("refuses an incomplete generation guard", (input) => {
    expect(ErrandMaterializeInputSchema.safeParse(input).success).toBe(false);
  });
});
