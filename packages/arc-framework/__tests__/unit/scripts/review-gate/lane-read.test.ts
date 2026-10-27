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
    nextPassContext: { completePasses: 1, convergence: "pending", responseDue: true, incremental: null }, target: delta.target, sources: ["delegated-agent"], ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: { lineage: delta.lineage,
    rejections: [{ lane: "standard", findingId: "finding-1", locus: "src/example.ts:1",
      sourceVerification: "not-supported", reason: "The source check established this disposition." }],
    facts: { completePasses: 1 }, nextLooks: { incremental: null, completePass: "admitted", responseDue: true, refusal: null } } });
  expect({ progress, record }).toEqual(before);
});

it("returns the shared facts and identifies the last clean fix check", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "clean");
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const result = await projectReviewLaneRead({ lineage: delta.lineage, progress: [owner], dispositions: [],
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false, incremental: null }, target: delta.target, sources: ["delegated-agent"], ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: {
    lastLook: { producerId: delta.operationId, coverage: "incremental", outcome: "clean" },
    facts: { completePasses: 1, ceiling: 4,
      fixChecksSinceLastComplete: [{ producerId: delta.operationId, outcome: "clean" }] },
    nextLooks: { incremental: null, completePass: "admitted", responseDue: false, refusal: null },
  } });
});

it("admits the proven incremental look at the ceiling, and a complete pass there only by override", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "clean");
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const producer = await fixture.resultReader.readResult(delta.operationId);
  const scope = { schemaVersion: 1 as const, predecessorProducerId: producer.producerId,
    predecessorHeadSha: producer.target.headSha, basisHeadSha: producer.target.headSha,
    headSha: fixture.currentTarget().headSha, requiredFindings: [] };
  const read = (completePasses: number) => projectReviewLaneRead({ lineage: delta.lineage, progress: [owner], dispositions: [],
    nextPassContext: { completePasses, convergence: "unconverged", responseDue: false,
      incremental: { basis: "fix-check", scope } }, target: delta.target, sources: ["delegated-agent"], ceiling: 2,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect((await read(1)).payload).toMatchObject({ nextLooks: { incremental: "fix-check", completePass: "admitted" } });
  expect((await read(2)).payload).toMatchObject({ nextLooks: { incremental: "fix-check", completePass: "ceiling-decision" } });});

it("admits no look after a material fix when the configured sources omit the local reviewer", async () => {
  const fixture = await createLocalDeltaFixture("Light");
  const delta = await fixture.moveHead(); await fixture.conclude(delta, "findings");
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const read = (sources: string[]) => projectReviewLaneRead({ lineage: delta.lineage, progress: [owner], dispositions: [],
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
    target: delta.target, sources, ceiling: 4, exec: async () => { throw new Error("Git unavailable"); } });
  expect((await read(["codex-pr"])).payload).toMatchObject({ nextLooks: { completePass: "admitted",
    refusal: { code: "material-fix-local-source-unconfigured" } } });
  expect((await read(["codex-pr", "delegated-agent"])).payload).toMatchObject({ nextLooks: { refusal: null } });
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
    nextPassContext: { completePasses: 1, convergence: "pending", responseDue: true, incremental: null }, target: delta.target, sources: ["delegated-agent"], ceiling: 4,
    exec: async () => { throw new Error("Git unavailable"); } });
  expect(result).toMatchObject({ state: "ready", payload: { rejections: [
    { lane: "frontline", findingId: "frontline-finding", locus: "src/frontline.ts:3", sourceVerification: "not-supported" },
    { lane: "standard", findingId: "finding-1", sourceVerification: "verified" },
  ], facts: { completePasses: 1 } } });
});
