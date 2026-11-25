/** A completed native delivery owner retains an exact current terminus offer. */
import { createNativePublishedDeliveryFixture, seedNativeClosedDeliveryTasks } from "./native-delivery-refusal.js";
import { handleReviewStatus, handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewTerminusAccept } from "../../../src/handlers/review.js";
import { ReviewStatusCommandResultSchema } from "../../../src/scripts/review-gate/status.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { localReviewResult } from "../in-process-review.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { projectPublicationBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaState, writeMetaCurrentWorkflow } from "../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import type { Store } from "../../../src/lib/store/contract.js";

/** Finish both member reviews, obtain the producer's offer, then complete its generation without a branch link. */
export async function createNativeCompletedTerminusFixture() {
  const h = await createNativePublishedDeliveryFixture("delegated-agent");
  await seedNativeClosedDeliveryTasks(h);
  const invocation = { ...h.native, workItem: h.primary.reference.owner };
  const policyTarget = { repository: "owner/repo", pullRequest: 42, headSha: h.heads[1]! };
  const initial = await readSubmissionBoundaryVersioned(h.cwd, "example", h.access);
  await writeSubmissionBoundary(h.cwd, projectPublicationBoundary({ workUnit: "example", branch: h.branches[1],
    candidateId: h.boundary.candidateId, candidateSubjectDigest: h.boundary.candidateSubjectDigest,
    reservation: h.boundary.reservation, readinessBinding: null,
    changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2), initial.version, h.access);
  const status = async (member?: number, additionalPass?: string) => {
    let output = "";
    await handleReviewStatus({ ...(member === undefined ? { workUnit: "example" } : { target: JSON.stringify({
      repository: "owner/repo", headRef: h.branches[member], headSha: h.heads[member] }) }),
    source: "delegated-agent", coverage: "complete", ...(additionalPass === undefined ? {} : { additionalPass }) }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} }, invocation);
    return ReviewStatusCommandResultSchema.parse(JSON.parse(output));
  };
  let precedingProducerId = "";
  for (const member of [0, 1]) {
    const offered = await status(member);
    if (offered.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(offered));
    let output = "";
    await handleReviewLocalPrepare("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify({ schemaVersion: 1,
      evaluatorIdentity: "independent-delivery-reviewer", deliveryAdmission: offered.action,
      routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
        ownership: "self", surfaceAuthority: "ordinary" } }),
    write: text => { output += text; }, setExitCode: () => {} }, undefined, invocation);
    const prepared = LocalPrepareEnvelopeSchema.parse(JSON.parse(output));
    if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
    output = "";
    await handleReviewLocalAttest("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify({
      ...localReviewResult(prepared.payload, `completed-member-${member}`, []), operationRef: prepared.payload.operationRef }),
    write: text => { output += text; }, setExitCode: () => {} }, undefined, invocation);
    const attested = LocalAttestEnvelopeSchema.parse(JSON.parse(output));
    if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
    precedingProducerId = prepared.payload.operationId;
  }
  const offered = await status(undefined, JSON.stringify({ target: policyTarget, lane: "standard", precedingProducerId,
    completedPasses: 1, nextPass: 2 }));
  if (!("terminusAction" in offered) || offered.terminusAction === undefined) throw new Error(JSON.stringify(offered));
  const request = { ...offered.terminusAction, judgment: { mode: "owner-accepted" } };
  const current = lifecycleSuccess(await h.reference.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(current, { content: writeMetaCurrentWorkflow(writeMetaState(current.content, "Integrating"), "integrate-work-unit"),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, links: { ...current.links, branches: [] } }),
  provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const accept = async (store: Store = h.reference.store) => {
    let output = "";
    const exits: number[] = [];
    const priorCwd = process.cwd();
    process.chdir(h.cwd);
    try { await handleReviewTerminusAccept("-", undefined, { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, { ...invocation, store }); } finally { process.chdir(priorCwd); }
    const result: unknown = JSON.parse(output);
    return { result, output, exits };
  };
  return { ...h, request, accept };
}
