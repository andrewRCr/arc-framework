/** Local delta admission adopts resolved coverage before publishing and replaying it. */
import { expect, it } from "vitest";
import { createLocalDeltaFixture } from "../../../../fixtures/local-review-delta.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

it.each([false, true])("publishes the admitted delta scope or explicit complete=%s", async explicitComplete => {
  const fixture = await createLocalDeltaFixture();
  const state = await fixture.moveHead("e", explicitComplete ? { requestedCoverage: "complete" } : undefined);
  expect(state.coverageAdmission).toEqual(explicitComplete ? { requestedCoverage: "complete" } : {
    requestedCoverage: "incremental", correctionScope: { schemaVersion: 1, predecessorProducerId: fixture.original.operationId,
      predecessorHeadSha: fixture.original.target.headSha, basisHeadSha: fixture.original.target.headSha,
      headSha: state.target.headSha, requiredFindings: [] },
  });
  if (!explicitComplete) {
    expect(state.reviewerInstructions).not.toMatch(/closure/iu);
    const replayed = await fixture.prepare();
    expect(replayed.operationId).toBe(state.operationId);
    expect(replayed.coverageAdmission).toEqual(state.coverageAdmission);
  }
});

it("replays a completed delta with its admitted coverage when no new coverage is supplied", async () => {
  const fixture = await createLocalDeltaFixture();
  const delta = await fixture.moveHead();
  await fixture.conclude(delta, "clean");
  expect(await prepareLocalReview(fixture.input, fixture.dependencies)).toMatchObject({ state: "review-complete",
    payload: { operationId: delta.operationId, target: delta.target } });
  expect(fixture.laneProgress()?.attempts).toHaveLength(2);
});
