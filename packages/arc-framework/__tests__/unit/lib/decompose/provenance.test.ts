/** Batch histories distinguish how a stored cut map was written or removed. */
import { describe, expect, it } from "vitest";
import { decomposeProvenance } from "../../../../src/lib/decompose/provenance.js";
import { CallerProvenanceSchema } from "../../../../src/lib/store/links.js";
import { assertSchemaAccepts } from "../../../helpers/schema-assertion.js";

describe("decomposition provenance", () => {
  it.each(["additive", "terminal", "discard", "revise"] as const)("names the %s batch", (action) => {
    expect(assertSchemaAccepts(CallerProvenanceSchema, decomposeProvenance(action)))
      .toEqual({ verb: "decompose", lifecycleAction: action });
  });
});
