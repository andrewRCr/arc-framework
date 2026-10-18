/** Lane reads expose source-checked rejections without making review decisions. */
import { expect, it } from "vitest";
import { createLocalDeltaFixture } from "../../../fixtures/local-review-delta.js";
import { approvedRecord } from "../../../fixtures/review-response-proof.js";
import type { LaneProgressState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { projectReviewLaneRead } from "../../../../src/scripts/review-gate/lane-read.js";

it("returns a Candidate's rejection reason and verification status from its lane owner", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "findings");
  const producer = await fixture.resultReader.readResult(delta.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject" }]);
  const progress = [...fixture.operations.values()].map(({ state }) => state)
    .filter((state): state is LaneProgressState => state.kind === "lane-progress");
  const before = structuredClone({ progress, record });
  const result = await projectReviewLaneRead({ lineage: delta.lineage, progress, dispositions: [record],
    nextPassContext: { convergence: "pending", responseDue: true, incremental: null }, target: delta.target, ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: { lineage: delta.lineage,
    rejections: [{ lane: "standard", findingId: "finding-1", locus: "src/example.ts:1",
      sourceVerification: "not-supported", reason: "The source check established this disposition." }],
    facts: { completePasses: 1 } } });
  expect({ progress, record }).toEqual(before);
});

it("returns the shared facts and identifies the last clean fix check", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "clean");
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const result = await projectReviewLaneRead({ lineage: delta.lineage, progress: [owner], dispositions: [],
    nextPassContext: { convergence: "converged", responseDue: false, incremental: null }, target: delta.target, ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: {
    lastLook: { producerId: delta.operationId, coverage: "incremental", outcome: "clean" },
    facts: { completePasses: 1, ceiling: 4,
      fixChecksSinceLastComplete: [{ producerId: delta.operationId, outcome: "clean" }] },
  } });
});

it("returns frontline rejections beside standard rejections in the Candidate lineage", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "findings");
  const standard = await fixture.resultReader.readResult(delta.operationId);
  const { createFrontlineFixture } = await import("../../../fixtures/frontline-review.js");
  const frontline = createFrontlineFixture(delta.target, { lineage: delta.lineage, findings: [{
    findingId: "frontline-finding", sourceOrdinal: 1, severity: "major", locus: "src/frontline.ts:3", evidenceUrlOrId: "source://frontline" }] });
  const producer = await frontline.reader.readResult(frontline.run.operationId);
  const result = await projectReviewLaneRead({ lineage: delta.lineage, progress: [frontline.lane, fixture.laneProgress()!],
    dispositions: [approvedRecord(producer, [{ sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject" }]),
      approvedRecord(standard, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "reject" }])],
    nextPassContext: { convergence: "pending", responseDue: true, incremental: null }, target: delta.target, ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: { rejections: [
    { lane: "frontline", findingId: "frontline-finding", locus: "src/frontline.ts:3", sourceVerification: "not-supported" },
    { lane: "standard", findingId: "finding-1", sourceVerification: "verified" },
  ], facts: { completePasses: 1 } } });
});
