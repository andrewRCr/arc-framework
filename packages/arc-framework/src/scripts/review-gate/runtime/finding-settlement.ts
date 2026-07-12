/** Coordinator-owned, receipt-backed finding settlement sequences. */

import type { Evidence } from "../core/evidence.js";
import type { ReviewReceipt, ReviewRequest } from "../core/execution.js";
import { createReceipt } from "../core/request-key.js";
import type { SettlementReply, SettlementThread } from "../hosts/github/settlement.js";

interface HeadUpdateProof { authorization: ReviewReceipt; consumption: ReviewReceipt }

interface SettlementReceiptPort {
  appendAndConfirm(receipt: ReviewReceipt, expectedLedgerVersion: number): Promise<ReviewReceipt>;
}

function assertHeadUpdateProof(input: {
  proof: HeadUpdateProof;
  findingId: string;
  oldHeadSha: string;
  fixHeadSha: string;
  actorIdentity: string;
}): void {
  const authorization = input.proof.authorization;
  const consumption = input.proof.consumption;
  const authorized = authorization.action === "begin-fix"
    && authorization.payload.kind === "head-update-authorization"
    && authorization.payload.oldHeadSha === input.oldHeadSha
    && authorization.payload.targetHeadSha === input.fixHeadSha
    && authorization.payload.actorIdentity === input.actorIdentity
    && authorization.findingIds.includes(input.findingId);
  const consumed = consumption.action === "head-update-consumed"
    && consumption.payload.kind === "head-update-consumption"
    && consumption.payload.authorizationReceiptHash === authorization.receiptHash
    && consumption.payload.oldHeadSha === input.oldHeadSha
    && consumption.payload.newHeadSha === input.fixHeadSha
    && consumption.findingIds.includes(input.findingId);
  if (!authorized || !consumed) throw new Error("invalid-head-update-proof");
}

/** Complete a FIX only after the authorized old→new-head proof and exact follow-up evidence. */
export async function settleFixedFinding(input: {
  request: ReviewRequest;
  findingId: string;
  commentId: string;
  threadId: string;
  oldHeadSha: string;
  fixHeadSha: string;
  actorIdentity: string;
  ciState: "pending" | "failure" | "success";
  followUpEvidence: Evidence;
  verificationRefs: string[];
  headUpdateProof: HeadUpdateProof;
  expectedLedgerVersion: number;
  settledAt: string;
}, deps: {
  ensureReply(body: string): Promise<SettlementReply>;
  ensureResolution(): Promise<SettlementThread>;
} & SettlementReceiptPort): Promise<{ fixed: ReviewReceipt; resolved: ReviewReceipt }> {
  assertHeadUpdateProof({
    proof: input.headUpdateProof,
    findingId: input.findingId,
    oldHeadSha: input.oldHeadSha,
    fixHeadSha: input.fixHeadSha,
    actorIdentity: input.actorIdentity,
  });
  const evidence = input.followUpEvidence;
  if (input.ciState !== "success"
    || evidence.sourceIdentity !== input.request.sourceIdentity
    || evidence.coverage !== "full"
    || evidence.coverageThroughSha !== input.fixHeadSha
    || evidence.headSha !== input.fixHeadSha
    || input.verificationRefs.length === 0) throw new Error("incomplete-fixed-proof");
  if (evidence.findings.some((finding) => finding.recursFindingId === input.findingId)) {
    throw new Error("finding-recurred");
  }

  const replyBody = `Addressed and verified on ${input.fixHeadSha.slice(0, 12)}. Follow-up review: ${evidence.evidenceUrlOrId}.`;
  const reply = await deps.ensureReply(replyBody);
  if (reply.actorIdentity !== input.actorIdentity || reply.body !== replyBody) throw new Error("canonical-inline-reply-mismatch");
  const replyRef = `github-review-comment:${reply.commentId}`;
  const fixedCandidate = createReceipt({
    eventId: `fixed:${input.request.sourceIdentity}:${input.findingId}:${input.fixHeadSha}`,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: "fixed",
    request: input.request,
    result: null,
    evidenceUrlOrId: replyRef,
    findingIds: [input.findingId],
    payload: {
      kind: "finding-disposition",
      disposition: "fixed",
      findingId: input.findingId,
      sourceIdentity: input.request.sourceIdentity,
      oldHeadSha: input.oldHeadSha,
      fixHeadSha: input.fixHeadSha,
      actorIdentity: input.actorIdentity,
      rationale: null,
      directReplyRef: replyRef,
      followUpEvidenceRef: evidence.evidenceUrlOrId,
      verificationRefs: input.verificationRefs,
      settledAt: input.settledAt,
    },
  });
  const fixed = await deps.appendAndConfirm(fixedCandidate, input.expectedLedgerVersion);
  if (fixed.receiptHash !== fixedCandidate.receiptHash || fixed.action !== "fixed") {
    throw new Error("fixed-receipt-not-canonical");
  }

  const thread = await deps.ensureResolution();
  if (!thread.isResolved || thread.threadId !== input.threadId
    || thread.resolvedByActorIdentity !== input.actorIdentity) throw new Error("canonical-thread-resolution-mismatch");
  const hostEvidenceRef = `github-review-thread:${thread.threadId}:resolved`;
  const resolutionCandidate = createReceipt({
    eventId: `conversation-resolved:${input.request.sourceIdentity}:${input.findingId}:${input.fixHeadSha}`,
    previousLedgerVersion: input.expectedLedgerVersion + 1,
    action: "conversation-resolved",
    request: input.request,
    result: null,
    evidenceUrlOrId: hostEvidenceRef,
    findingIds: [input.findingId],
    payload: {
      kind: "conversation-resolved",
      findingId: input.findingId,
      sourceIdentity: input.request.sourceIdentity,
      headSha: input.fixHeadSha,
      threadId: input.threadId,
      resolvedByActorIdentity: input.actorIdentity,
      dispositionReceiptHash: fixed.receiptHash,
      hostEvidenceRef,
      resolvedAt: input.settledAt,
    },
  });
  const resolved = await deps.appendAndConfirm(resolutionCandidate, input.expectedLedgerVersion + 1);
  if (resolved.receiptHash !== resolutionCandidate.receiptHash || resolved.action !== "conversation-resolved") {
    throw new Error("resolution-receipt-not-canonical");
  }
  return { fixed, resolved };
}
