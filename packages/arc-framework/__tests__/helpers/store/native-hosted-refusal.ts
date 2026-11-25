/** Genuine native hosted admissions stopped at the durable reserved-request crash window. */
import type { Store } from "../../../src/lib/store/contract.js";
import { createNativePublishedDeliveryFixture } from "./native-delivery-refusal.js";
import { handleReviewChangeRequestResolve, handleReviewStatus, handleReviewHostedRequest } from "../../../src/handlers/review.js";
import { ChangeRequestResolveResultSchema } from "../../../src/scripts/review-gate/change-request.js";
import { ReviewStatusCommandResultSchema } from "../../../src/scripts/review-gate/status.js";
import { HostedRequestEnvelopeSchema } from "../../../src/scripts/review-gate/hosted/request.js";
import { createReviewTarget, createReviewRequirement } from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { recordHostedRequestAdmission } from "../../../src/scripts/review-gate/lane-progress-hosted-request.js";
import { HostedRequestOwnerIndex } from "../../../src/scripts/review-gate/hosts/local/hosted-request-owner-index.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import type { HostedProcessRunner } from "../../../src/scripts/review-gate/hosted/gh-process.js";

/** Produce a member request through status, reserve its owner and persist admission before marking admitted. */
export async function createNativeReservedHostedFixture(sourceId = "codex-pr") {
  const h = await createNativePublishedDeliveryFixture(sourceId);
  const invocation = { ...h.native, workItem: h.primary.reference.owner };
  let output = "";
  await handleReviewChangeRequestResolve({ headRef: h.branches[0]!, headSha: h.heads[0]!, requireRemote: true }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} });
  const resolved = ChangeRequestResolveResultSchema.parse(JSON.parse(output));
  if (resolved.state !== "open") throw new Error(JSON.stringify(resolved));
  output = "";
  await handleReviewStatus({ target: JSON.stringify(resolved.targetRef), source: sourceId, coverage: "complete" }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} }, invocation);
  const offered = ReviewStatusCommandResultSchema.parse(JSON.parse(output));
  if (offered.nextAction !== "review-hosted-request") throw new Error(JSON.stringify(offered));
  const request = HostedRequestEnvelopeSchema.parse(offered.action);
  if (request.vehicle?.kind !== "delivery-member") throw new Error("Expected member admission");
  const member = h.state.members[0]!;
  if (member.coordinates === null) throw new Error("Expected published member");
  const reviewTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: h.projectId, baseRef: "main", diffBaseSha: member.coordinates.base,
    diffBaseTree: await h.git("rev-parse", `${member.coordinates.base}^{tree}`), headSha: member.coordinates.head,
    headTree: member.coordinates.tree });
  const requirement = createReviewRequirement({ target: reviewTarget, projection: h.obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: request.provider }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("Expected hosted obligation");
  const lineage = { kind: "delivery-member" as const, planId: request.vehicle.planId,
    deliverableId: request.vehicle.deliverableId, workUnitId: request.vehicle.workUnitId };
  const context = createReviewCompositionContext(invocation), operations = context.family.ports.inFlight;
  const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(h.realExec, h.cwd));
  const admitted = await recordHostedRequestAdmission(operations, { repositoryId: h.projectId, lineage, request,
    progressVehicle: request.vehicle, reviewTarget, requirement, actorIdentity: "123", now: new Date().toISOString(),
    authorizeCapacity: async capacity => {
      const reserved = await index.reserve({ repositoryId: h.projectId, workItem: h.primary.reference.owner, request,
        lineage, logicalPass: capacity.logicalPass, completedPassesAtAdmission: capacity.progress?.completedPasses ?? 0,
        oldAdmissionAbsent: async () => false, oldPassCompleted: async () => false });
      if (reserved !== "reserved") throw new Error(`Expected reservation, got ${reserved}`);
    } });
  if (admitted.state !== "admitted") throw new Error(JSON.stringify(admitted));
  const hostedRunner: HostedProcessRunner = { run: async (args, options) => {
    if (args[0] === "api" && args[1] === "user") return { stdout: JSON.stringify({ id: 123 }), stderr: "" };
    if (args[0] === "api" && args[1]?.endsWith("/comments") && args.includes("POST")) return { stdout: JSON.stringify({
      node_id: "request-1", html_url: "https://github.com/owner/repo/pull/41#issuecomment-1", user: { id: 123 },
      body: "@codex review", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }), stderr: "" };
    const result = await h.realExec("gh", [...args], { ...options, cwd: h.cwd });
    return { stdout: result.stdout, stderr: result.stderr ?? "" };
  } };
  const submit = async (store: Store = h.reference.store) => {
    let output = "";
    const exits: number[] = [];
    const priorCwd = process.cwd();
    process.chdir(h.cwd);
    try { await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
    { ...invocation, store, hostedRunner }); } finally { process.chdir(priorCwd); }
    const result: unknown = JSON.parse(output);
    return { result, output, exits };
  };
  return { ...h, request, admitted, index, submit, reviewOwner: h.primary.reference.owner, invocation, operations, reviewTarget, requirement, lineage };
}


/** Seal a provider-observed member finding through its real admission and acknowledgment records. */
export async function createNativeHostedFindingsFixture() {
  const h = await createNativeReservedHostedFixture();
  const { createHostedTerminalAttemptFixture } = await import("../../fixtures/hosted-review.js");
  const { acknowledgeHostedRequest, recordHostedAwaitAttempt } = await import("../../../src/scripts/review-gate/lane-progress-hosted-request.js");
  const { seedNativeClosedDeliveryTasks, carryNativeDeliveryStatus } = await import("./native-delivery-refusal.js");
  const now = "2026-11-04T12:01:00Z";
  await h.index.markAdmitted({ repositoryId: h.projectId, request: h.request, lineage: h.lineage,
    logicalPass: h.admitted.admission.logicalPass });
  const terminal = createHostedTerminalAttemptFixture({ admission: h.admitted.admission, outcome: "findings",
    artifact: { kind: "issue-comment", id: "findings-request", url: "https://example.invalid/request", createdAt: now },
    findings: [{ findingId: "finding-1", severity: "major", sourceOrdinal: 1, origin: "review-body", reviewId: "review-1",
      fingerprint: "finding-1", settlement: "not-applicable", locus: "member-1.ts:1", url: "https://example.invalid/finding", body: "Correct the first member." }] });
  const handle = terminal.hosted.handle!;
  await acknowledgeHostedRequest(h.operations, { admission: h.admitted.admission, handle, now });
  await recordHostedAwaitAttempt(h.operations, { repositoryId: h.projectId, now, result: { schemaVersion: 1,
    mode: "review-hosted-await", handle, state: "findings", nextAction: "triage", reviewUrl: "https://example.invalid/review",
    findings: terminal.hosted.sealedResult!.findings } });
  await seedNativeClosedDeliveryTasks(h);
  await carryNativeDeliveryStatus(h);
  return h;
}
