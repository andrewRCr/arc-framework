/** Imported readiness uses the same canonical records as store-backed publication reads. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { deriveReviewReadinessBinding } from "../../../../../../src/lib/store/kinds/review/integration-boundary/readiness.js";
import { IntegrationBoundaryLocusSchema } from "../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../../src/lib/store/kinds/review/integration-boundary/schema.js";
import { createKindRegistry } from "../../../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { StoreRecordSchema } from "../../../../../../src/lib/store/read.js";
import { mappingBoundaryFixture } from "../../../../../fixtures/review-mapping-boundary.js";
import { createLocalMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";

it.each(["matching", "moved", "missing", "absent-owner"] as const)("imports readiness for a %s lane version", async (version) => {
  const { input: base, boundary } = mappingBoundaryFixture("candidate-publish-ready");
  const fixture = await createLocalMappingFixture({ imported: base,
    lineage: { kind: "candidate", candidateId: boundary.candidateId }, vehicle: { kind: "work-unit", identity: "example" } });
  await fixture.conclude("clean");
  const input = version === "absent-owner" ? base : fixture.input();
  const owner = [...fixture.operations.values()].find(({ state }) => state.kind === "lane-progress")!;
  const recordedVersion = version === "matching" ? owner.version : version === "moved" ? owner.version - 1 : 0;
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    ...(version === "missing" ? {} : { standardLaneOwnerVersion: recordedVersion }) }));
  const result = mapReviewRecords(input);
  const mapped = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!));
  if (!("readinessBinding" in mapped)) throw new Error("Expected a publication readiness binding");
  if (version === "missing" || version === "moved") expect(mapped.readinessBinding).toBeNull();
  else {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const records = result.records.map(({ reference, contents }) => {
      const content = contents.at(-1)!;
      const parsed = registry[reference.kind].parser!(content);
      if (!parsed.success) throw new Error(parsed.error);
      return StoreRecordSchema.parse({ reference, content, fields: parsed.data, version: "opaque-backend-version",
        formatVersion: 1, conflicts: [], placement: { kind: "active" } });
    });
    const listing = (kind: string) => ({ status: "complete" as const, records: records.filter(({ reference }) => reference.kind === kind),
      diagnostics: [], missed: false });
    const expected = deriveReviewReadinessBinding({ subjectOwner: { kind: "candidate", candidateId: boundary.candidateId },
      outcomes: listing("review/outcome"), evidence: listing("review/evidence"), decisions: listing("review/decision"), inFlight: [] });
    expect(expected.status).toBe("complete");
    if (expected.status !== "complete") throw new Error(expected.condition);
    expect(mapped.readinessBinding).toBe(expected.digest);
  }
  await assertReviewMapping(result);
});
