/** Generation-guard input contract for Errand materialization. */

import { describe, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import { ErrandMaterializeInputSchema } from "../../../src/handlers/errand.js";

const claimId = "c".repeat(32);
const expectedHead = "a".repeat(40);

describe("Errand materialize input", () => {
  it.each([
    { slug: "fix-output" },
    { slug: "fix-output", claimId, expectedHead },
  ])("accepts an absent guard or a complete generation guard", (input) => {
    assertSchemaAccepts(ErrandMaterializeInputSchema, input);
  });

  it.each([
    { slug: "fix-output", claimId },
    { slug: "fix-output", expectedHead },
  ])("refuses an incomplete generation guard", (input) => {
    assertSchemaRefuses(ErrandMaterializeInputSchema, input);
  });
});
