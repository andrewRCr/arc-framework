/** Genuine complete and incremental hosted outcomes under a full-final native delivery obligation. */
import { createNativeReservedHostedFixture } from "./native-hosted-refusal.js";
import { createHostedTerminalAttemptFixture } from "../../fixtures/hosted-review.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest, recordHostedAwaitAttempt } from "../../../src/scripts/review-gate/lane-progress-hosted-request.js";
import { createHostedReservationDischargeReader } from "../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { createRawGitExec } from "../../../src/lib/io-context.js";
import type { Store } from "../../../src/lib/store/contract.js";

/** Produce two actual passes at one member head; incremental coverage cannot satisfy full-final policy. */
export async function createNativeIncrementalCoverageFixture() {
  const h = await createNativeReservedHostedFixture("coderabbit-pr");
  if (h.request.vehicle?.kind !== "delivery-member") throw new Error("Expected member request");
  const vehicle = h.request.vehicle, now = () => "2026-11-04T12:01:00Z";
  let admitted = h.admitted.admission, predecessorProducerId = "";
  for (const pass of [1, 2]) {
    const request = pass === 1 ? h.request : { ...h.request, coverage: "incremental" as const,
      correctionScope: { schemaVersion: 1 as const, predecessorProducerId, predecessorHeadSha: h.request.target.headSha,
        basisHeadSha: h.request.target.headSha, headSha: h.request.target.headSha, requiredFindings: [] } };
    if (pass === 2) {
      const next = await recordHostedRequestAdmission(h.operations, { repositoryId: h.projectId, lineage: h.lineage,
        request, progressVehicle: vehicle, reviewTarget: h.reviewTarget, requirement: h.requirement, actorIdentity: "123", now: now(),
        authorizeCapacity: async capacity => {
          const reserved = await h.index.reserve({ repositoryId: h.projectId, workItem: h.reviewOwner, request,
            lineage: h.lineage, logicalPass: capacity.logicalPass, completedPassesAtAdmission: capacity.progress?.completedPasses ?? 0,
            oldAdmissionAbsent: async () => false,
            oldPassCompleted: async prior => (capacity.progress?.completedPasses ?? 0) > prior.completedPassesAtAdmission });
          if (reserved !== "reserved") throw new Error(reserved);
        } });
      if (next.state !== "admitted") throw new Error(JSON.stringify(next));
      admitted = next.admission;
    }
    await h.index.markAdmitted({ repositoryId: h.projectId, request, lineage: h.lineage, logicalPass: admitted.logicalPass });
    const artifact = { kind: "issue-comment" as const, id: `coverage-${pass}`,
      url: `https://example.invalid/request-${pass}`, createdAt: now() };
    const coverageEvidence = pass === 1 ? undefined : { schemaVersion: 1 as const, kind: "provider-native-incremental" as const,
      sourceId: "coderabbit-pr" as const, requestArtifactId: artifact.id, status: "established" as const,
      baselineSha: admitted.correctionScope!.predecessorHeadSha, headSha: admitted.target.headSha,
      providerGeneration: { artifactId: "generation-2", url: "https://example.invalid/generation-2",
        createdAt: now(), updatedAt: "2026-11-04T12:02:00Z", actorIdentity: "136622811" as const, appId: "347564" as const } };
    const terminal = createHostedTerminalAttemptFixture({ admission: admitted, artifact, outcome: "clean", coverageEvidence });
    const handle = terminal.hosted.handle!;
    await acknowledgeHostedRequest(h.operations, { admission: admitted, handle, now: now() });
    await recordHostedAwaitAttempt(h.operations, { repositoryId: h.projectId, now: now(), result: { schemaVersion: 1,
      mode: "review-hosted-await", handle, state: "clean", nextAction: "complete", reviewUrl: "https://example.invalid/review",
      ...(terminal.hosted.sealedResult?.coverageEvidence === undefined ? {} : { coverageEvidence: terminal.hosted.sealedResult.coverageEvidence }) } });
    predecessorProducerId = terminal.attemptId;
  }
  if (h.boundary.reservation === null) throw new Error("Expected reservation");
  const read = (store: Store = h.reference.store) => createHostedReservationDischargeReader({ ...h.invocation, store,
    rawExec: createRawGitExec(h.cwd) })({ reservation: h.boundary.reservation,
    baseRevision: h.reviewTarget.diffBaseSha, approvedHead: h.reviewTarget.headSha,
    changeRequest: { repository: "owner/repo", pullRequest: 41 }, vehicle });
  return { ...h, read, outcomeReference: recordReferences["review/outcome"](h.reviewOwner,
    admitted.admissionId.replace(/^hosted-admission\//u, "hosted-admission-")) };
}
