/** Full-final member review keeps repair checks separate from complete-pass closure. */
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { LocalApprovedDispositionRecordStore } from "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { currentApprovedDispositionNode } from "../../src/scripts/review-gate/core/advisory-records.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDir } from "../helpers/integration.js";
import { inProcessReview } from "../helpers/in-process-review.js";
import {
  createFixedLocalMemberReview, completeLocalReviewThroughHandlers, git, roots,
  respondThroughHandler, resumeLocalThroughHandler, statusThroughHandler, type FanOutHarness,
} from "../fixtures/review-fan-out-harness.js";

afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

async function reduceCleanReview(harness: FanOutHarness, operationId: string) {
  expect(await resumeLocalThroughHandler(harness, { schemaVersion: 1, operationId }))
    .toMatchObject({ state: "review-complete", nextAction: "reduce" });
  expect(await inProcessReview.reduce(harness.root, { schemaVersion: 1, operationId }))
    .toMatchObject({ state: "advisory-complete", nextAction: "none" });
}

it("requires complete-pass approval at the ceiling while admitting the member fix check", async () => {
  const { harness, correctedTarget, local } = await createFixedLocalMemberReview(1);
  const complete = await statusThroughHandler(harness, correctedTarget, undefined, "complete", "delegated-agent");
  expect(complete, JSON.stringify(complete)).toMatchObject({ state: "approval-required", nextAction: "obtain-ceiling-override" });
  const selected = await statusThroughHandler(harness, correctedTarget, undefined, "incremental", "delegated-agent");
  expect(selected, JSON.stringify(selected)).toMatchObject({ nextAction: "review-local-prepare", action: {
    requestedCoverage: "incremental", pass: 2,
    correctionScope: { predecessorProducerId: local.prepared.payload.operationId },
  } });
  if (selected.nextAction !== "review-local-prepare") throw new Error("expected the member fix check");
  const check = await completeLocalReviewThroughHandlers(harness, selected.action);
  await reduceCleanReview(harness, check.prepared.payload.operationId);
  expect(await statusThroughHandler(harness, correctedTarget)).toMatchObject({
    state: "approval-required", nextAction: "obtain-ceiling-override",
  });
}, 60_000);

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

async function bindPublishedMemberObservations(harness: FanOutHarness) {
  await git(harness.root, ["remote", "add", "origin", "git@github.com:owner/repository.git"]);
  const exec = harness.exec;
  harness.exec = async (command, args, options) => {
    if (command === "git" && args[0] === "ls-remote") {
      const ref = args.at(-1);
      if (args[1] !== "--heads" || args[2] !== "origin" || ref === undefined) throw new Error("unexpected remote read");
      return { stdout: `${await git(harness.root, ["rev-parse", ref])}\t${ref}\n`, stderr: "" };
    }
    if (command === "gh") {
      if (args[0] !== "pr" || args[1] !== "list") throw new Error("unexpected host read");
      const head = args[args.indexOf("--head") + 1];
      const search = args[args.indexOf("--search") + 1];
      const candidates = await Promise.all(harness.state.members.map(async (member, index) => {
        if (member.ref === null || member.changeRequest === null) throw new Error("expected published member");
        const base = index === 0 ? harness.state.target?.ref : harness.state.members[index - 1]?.ref;
        if (base === undefined || base === null) throw new Error("expected published member base");
        return { number: Number(member.changeRequest.changeRequestId),
          url: `https://github.com/owner/repository/pull/${member.changeRequest.changeRequestId}`, state: "OPEN",
          baseRefName: base.replace(/^refs\/heads\//u, ""), headRefName: member.ref.replace(/^refs\/heads\//u, ""),
          headRefOid: await git(harness.root, ["rev-parse", member.ref]) };
      }));
      return { stdout: JSON.stringify(candidates.filter(candidate => args.includes("--head")
        ? candidate.headRefName === head : candidate.headRefOid === search)), stderr: "" };
    }
    return exec(command, args, options);
  };
}

it("retains advisory fix tags through a performed member fix and its verified replay", async () => {
  const { harness, local } = await createFixedLocalMemberReview(4);
  await bindPublishedMemberObservations(harness);
  const store = new LocalApprovedDispositionRecordStore(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
  const record = await store.readDispositionRecord(local.prepared.payload.operationId);
  if (record === null || record.source.kind !== "attested-local") throw new Error("expected the performed local response");
  const node = currentApprovedDispositionNode(record);
  expect(node.advisoryFixTags).toEqual([{ findingId: "finding-local-1", tag: "local-correction" }]);
  if (node.deliveryMemberFixResponse === null) throw new Error("expected the exact member fix proof");
  const replay = await respondThroughHandler(harness, {
    schemaVersion: 1, source: { kind: "attested-local", receiptRef: record.source.receiptRef },
    policyRequest: node.responsePolicyRequest, dispositions: node.approvedDisposition,
    verifiedFix: { applicability: node.deliveryMemberFixResponse.applicability,
      verificationEvidenceRefs: node.deliveryMemberFixResponse.fixConsumption.verificationRefs },
  });
  expect(replay.state, JSON.stringify(replay)).toBe("delivery-member-current");
  if (!("dispositionReportText" in replay.payload)) throw new Error("expected the replay report");
  expect(replay.payload.dispositionReportText).toContain(
    `Approved disposition set ${node.approvedDisposition.dispositionSet.dispositionSetId}`,
  );
  expect(replay.payload.dispositionReportText).toContain("FIX (local correction)");
  for (const absent of ["**Fails:**", "**Decisions**", "Loop reading"]) {
    expect(replay.payload.dispositionReportText).not.toContain(absent);
  }
  expect(await store.readDispositionRecord(local.prepared.payload.operationId)).toEqual(record);
}, 60_000);
