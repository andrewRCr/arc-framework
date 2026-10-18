/** Full-final member review keeps repair checks separate from complete-pass closure. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDir } from "../helpers/integration.js";
import { inProcessReview } from "../helpers/in-process-review.js";
import {
  createFixedLocalMemberReview, completeLocalReviewThroughHandlers, git, roots,
  resumeLocalThroughHandler, statusThroughHandler, type FanOutHarness,
} from "../fixtures/review-fan-out-harness.js";

afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

async function reduceCleanReview(harness: FanOutHarness, operationId: string) {
  expect(await resumeLocalThroughHandler(harness, { schemaVersion: 1, operationId }))
    .toMatchObject({ state: "review-complete", nextAction: "reduce" });
  expect(await inProcessReview.reduce(harness.root, { schemaVersion: 1, operationId }))
    .toMatchObject({ state: "advisory-complete", nextAction: "none" });
}

it("keeps a clean member fix check open until complete review and excludes a later plain commit from delta checks", async () => {
  const { harness, correctedTarget, local } = await createFixedLocalMemberReview(4);
  const selected = await statusThroughHandler(harness, correctedTarget, undefined, "incremental", "delegated-agent");
  expect(selected, JSON.stringify(selected)).toMatchObject({ nextAction: "review-local-prepare", action: {
    sourceId: "delegated-agent", requestedCoverage: "incremental", pass: 2,
    correctionScope: { predecessorProducerId: local.prepared.payload.operationId },
  } });
  if (selected.nextAction !== "review-local-prepare") throw new Error("expected the local member fix check");
  const check = await completeLocalReviewThroughHandlers(harness, selected.action);
  await reduceCleanReview(harness, check.prepared.payload.operationId);
  const successor = await statusThroughHandler(harness, correctedTarget);
  expect(successor, JSON.stringify(successor)).toMatchObject({ nextAction: "review-local-prepare", action: {
    requestedCoverage: "complete", pass: 3,
  }, routedObligation: { conjunction: { members: [{ state: "outstanding" }, { state: "outstanding" }] } } });
  if (successor.nextAction !== "review-local-prepare") throw new Error("expected complete review after the clean fix check");
  const complete = await completeLocalReviewThroughHandlers(harness, successor.action);
  expect(complete.prepared.payload.reviewerPayload.reviewerInstructions).toContain("Previously reported and fixed");
  await reduceCleanReview(harness, complete.prepared.payload.operationId);
  const closed = await statusThroughHandler(harness, correctedTarget);
  expect(closed, JSON.stringify(closed)).toMatchObject({ routedObligation: { conjunction: { members: [
    { state: "discharged", progress: { completePasses: 2 } }, { state: "outstanding" },
  ] } } });

  await writeFile(join(harness.root, "first.txt"), "plain member successor\n");
  await git(harness.root, ["commit", "-am", "plain member successor"]);
  const head = await git(harness.root, ["rev-parse", "HEAD"]);
  const tree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
  const state = { ...harness.state, members: [{ ...harness.state.members[0]!,
    coordinates: { base: harness.baseHead, head, tree } }, harness.state.members[1]!] };
  const published = await harness.states.publish(harness.plan.planId, state, harness.stateRevision);
  if (published.status !== "ok") throw new Error("expected the plain member head in delivery state");
  const moved = await statusThroughHandler(harness, { ...correctedTarget, headSha: head });
  expect(moved, JSON.stringify(moved)).toMatchObject({ nextAction: "resolve-review-applicability" });
}, 60_000);
