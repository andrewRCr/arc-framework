/** Complete reviewers receive earlier fix locations without disposition judgments. */
import { expect, it } from "vitest";
import { projectFixedFindingPointers } from "../../../../../src/scripts/review-gate/core/fixed-finding-pointers.js";
import { createLocalDeltaFixture } from "../../../../fixtures/local-review-delta.js";
import { createFrontlineFixture } from "../../../../fixtures/frontline-review.js";
import { approvedRecord } from "../../../../fixtures/review-response-proof.js";

it("selects only verified fixes from both lanes and exposes only loci and optional labels", async () => {
  const local = await createLocalDeltaFixture("Light");
  const prepared = await local.moveHead(); await local.conclude(prepared, "findings");
  const standard = await local.resultReader.readResult(prepared.operationId);
  const frontline = createFrontlineFixture(prepared.target, { lineage: prepared.lineage, findings:
    ["fixed", "legacy", "deferred", "rejected", "unsupported"].map((id, index) => ({ findingId: id,
      sourceOrdinal: index + 1, severity: "major", locus: `src/${id}.ts:3`, evidenceUrlOrId: `source://${id}` })) });
  const producer = await frontline.reader.readResult(frontline.run.operationId);
  const records = [approvedRecord(standard, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]),
    approvedRecord(producer, [
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix", title: "Missing authorization check" },
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" },
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer", title: "Deferred issue" },
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "reject", title: "Clean so far" },
      { sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject", title: "Unsupported issue" },
    ])];
  expect(projectFixedFindingPointers(records)).toEqual([
    { locus: "src/example.ts:1" }, { locus: "src/fixed.ts:3", title: "Missing authorization check" },
    { locus: "src/legacy.ts:3" },
  ]);
});
