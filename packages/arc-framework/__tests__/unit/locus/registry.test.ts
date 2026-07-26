/** Schema discovery coverage for the locus family. */

import { describe, expect, it } from "vitest";

import {
  LOCUS_SCHEMA_IDS,
  createLocusRegistry,
} from "../../../src/lib/locus/registry.js";
import {
  LocusEnvelopeV1Schema,
  LocusIdentityV1Schema,
  LocusMutationResultV1Schema,
  LocusRecordV1Schema,
  LocusStateV1Schema,
} from "../../../src/lib/locus/schema/index.js";

describe("locus schema registry", () => {
  it("composes stable family roots into a fresh kernel registry", () => {
    const registry = createLocusRegistry();
    expect(registry.ids()).toEqual([
      "locus-envelope", "locus-identity", "locus-mutation-result", "locus-record", "locus-state",
      "priority", "slug", "work-class", "work-unit-state",
    ]);
    expect(registry.get(LOCUS_SCHEMA_IDS.record)).toBe(LocusRecordV1Schema);
    expect(registry.get(LOCUS_SCHEMA_IDS.identity)).toBe(LocusIdentityV1Schema);
    expect(registry.get(LOCUS_SCHEMA_IDS.envelope)).toBe(LocusEnvelopeV1Schema);
    expect(registry.get(LOCUS_SCHEMA_IDS.state)).toBe(LocusStateV1Schema);
    expect(registry.get(LOCUS_SCHEMA_IDS.mutationResult)).toBe(LocusMutationResultV1Schema);
    for (const id of Object.values(LOCUS_SCHEMA_IDS)) {
      expect(registry.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
    }
  });
});
