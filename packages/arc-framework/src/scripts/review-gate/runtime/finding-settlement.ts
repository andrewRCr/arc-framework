/** Coordinator-owned, receipt-backed finding settlement sequences. */

import { canonicalDigest } from "../../../lib/kernel/index.js";
import type { Evidence } from "../core/evidence.js";
import type { ApprovedDispositionSet } from "../core/disposition-records.js";
import {
  FixAuthorizationConsumptionSchema,
  validateFixAuthorization,
  type FixAuthorization,
  type FixAuthorizationConsumption,
} from "../core/fix-authorization.js";
import { validateDispositionState } from "../core/dispositions.js";
import {
  FindingConversationClosureV2Schema,
  FindingSettlementV2Schema,
  NormalizedReviewFindingSchema,
  type FindingConversationClosureV2,
  type FindingSettlementV2,
  type NormalizedReviewFinding,
} from "../core/finding-records.js";
import type { ReviewReceipt, ReviewRequest } from "../core/execution.js";
import { createReceipt } from "../core/request-key.js";
import type { SettlementReply, SettlementThread } from "../hosts/github/settlement.js";

/** Create one forward settlement from a normalized finding; host closure remains a separate record. */
export function createFindingSettlementV2(input: {
  dispositionState: ApprovedDispositionSet;
  finding: NormalizedReviewFinding;
  settledBy: string;
  settledAt: string;
  fixTargetId: string | null;
  fixConsumption?: FixAuthorizationConsumption | null;
  verificationRefs: string[];
}): FindingSettlementV2 {
  const dispositionState = validateDispositionState(input.dispositionState);
  if (dispositionState.state !== "approved") throw new Error("finding settlement requires approved dispositions");
  const { dispositionSet, approval } = dispositionState;
  const finding = NormalizedReviewFindingSchema.parse(input.finding);
  const disposition = dispositionSet.findings.find((candidate) => candidate.findingId === finding.findingId);
  if (disposition === undefined
    || disposition.locus !== finding.locus
    || disposition.severity !== finding.severity
    || disposition.nit !== finding.nit) {
    throw new Error("finding does not match the approved disposition set");
  }
  return FindingSettlementV2Schema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: dispositionSet.targetId,
    dispositionSetId: dispositionSet.dispositionSetId,
    approval,
    findingId: finding.findingId,
    sourceIdentity: disposition.sourceIdentity,
    severity: finding.severity,
    ...(finding.nit === undefined ? {} : { nit: finding.nit }),
    disposition: disposition.disposition,
    rationale: disposition.rationale,
    settledBy: input.settledBy,
    settledAt: input.settledAt,
    fixTargetId: input.fixTargetId,
    fixConsumption: input.fixConsumption ?? null,
    verificationRefs: input.verificationRefs,
  });
}

/** Bind a host closure to an existing settlement without extending the disposition vocabulary. */
export function createFindingConversationClosureV2(input: {
  settlement: FindingSettlementV2;
  authorityIdentity: string;
  hostEvidenceRef: string;
  closedAt: string;
}): FindingConversationClosureV2 {
  const settlement = FindingSettlementV2Schema.parse(input.settlement);
  return FindingConversationClosureV2Schema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: settlement.targetId,
    findingId: settlement.findingId,
    sourceIdentity: settlement.sourceIdentity,
    authorityIdentity: input.authorityIdentity,
    settlementId: canonicalDigest(settlement),
    hostEvidenceRef: input.hostEvidenceRef,
    closedAt: input.closedAt,
  });
}

export interface HeadUpdateProof {
  authorization: FixAuthorization;
  consumption: FixAuthorizationConsumption;
}

interface SettlementReceiptPort {
  appendAndConfirm(receipt: ReviewReceipt, expectedLedgerVersion: number): Promise<ReviewReceipt>;
}

function assertHeadUpdateProof(input: {
  proof: HeadUpdateProof;
  findingId: string;
  dispositionState: ApprovedDispositionSet;
  oldTargetId: string;
  fixTargetId: string;
  oldHeadSha: string;
  fixHeadSha: string;
  actorIdentity: string;
  verificationRefs: string[];
}): void {
  const dispositionState = validateDispositionState(input.dispositionState);
  if (dispositionState.state !== "approved") throw new Error("invalid-head-update-proof");
  let authorization: FixAuthorization;
  let consumption: FixAuthorizationConsumption;
  try {
    authorization = validateFixAuthorization(input.proof.authorization);
    consumption = FixAuthorizationConsumptionSchema.parse(input.proof.consumption);
  } catch {
    throw new Error("invalid-head-update-proof");
  }
  const authorized = authorization.oldTargetId === input.oldTargetId
    && authorization.oldHeadSha === input.oldHeadSha
    && authorization.dispositionSetId === dispositionState.dispositionSet.dispositionSetId
    && authorization.authorizedFindingIds.includes(input.findingId);
  const consumed = consumption.fixAuthorizationId === authorization.fixAuthorizationId
    && consumption.dispositionSetId === authorization.dispositionSetId
    && consumption.oldTargetId === input.oldTargetId
    && consumption.newTargetId === input.fixTargetId
    && consumption.oldHeadSha === input.oldHeadSha
    && consumption.newHeadSha === input.fixHeadSha
    && consumption.appliedBy === input.actorIdentity
    && consumption.verificationRefs.length === input.verificationRefs.length
    && consumption.verificationRefs.every((reference, index) => reference === input.verificationRefs[index]);
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
  oldTargetId: string;
  fixTargetId: string;
  dispositionState: ApprovedDispositionSet;
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
    dispositionState: input.dispositionState,
    oldTargetId: input.oldTargetId,
    fixTargetId: input.fixTargetId,
    oldHeadSha: input.oldHeadSha,
    fixHeadSha: input.fixHeadSha,
    actorIdentity: input.actorIdentity,
    verificationRefs: input.verificationRefs,
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

/** Complete DEFER/REJECT on the unchanged head through reply → authority → resolution. */
export async function settleNonFixFinding(input: {
  request: ReviewRequest;
  disposition: "deferred" | "rejected";
  findingId: string;
  commentId: string;
  threadId: string;
  headSha: string;
  currentHeadSha: string;
  actorIdentity: string;
  rationale: string;
  expectedLedgerVersion: number;
  settledAt: string;
}, deps: {
  ensureReply(body: string): Promise<SettlementReply>;
  ensureResolution(): Promise<SettlementThread>;
} & SettlementReceiptPort): Promise<{ disposition: ReviewReceipt; resolved: ReviewReceipt }> {
  if (input.currentHeadSha !== input.headSha) throw new Error("nonfix-head-changed");
  const rationale = input.rationale.trim();
  if (rationale.length === 0 || Buffer.byteLength(rationale, "utf8") > 1024) {
    throw new Error("invalid-settlement-rationale");
  }
  const replyBody = `${input.disposition === "deferred" ? "Deferred" : "Rejected"}: ${rationale}`;
  const reply = await deps.ensureReply(replyBody);
  if (reply.actorIdentity !== input.actorIdentity || reply.body !== replyBody) throw new Error("canonical-inline-reply-mismatch");
  const replyRef = `github-review-comment:${reply.commentId}`;
  const candidate = createReceipt({
    eventId: `${input.disposition}:${input.request.sourceIdentity}:${input.findingId}:${input.headSha}`,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: input.disposition,
    request: input.request,
    result: null,
    reason: rationale,
    evidenceUrlOrId: replyRef,
    findingIds: [input.findingId],
    payload: {
      kind: "finding-disposition",
      disposition: input.disposition,
      findingId: input.findingId,
      sourceIdentity: input.request.sourceIdentity,
      oldHeadSha: input.headSha,
      fixHeadSha: null,
      actorIdentity: input.actorIdentity,
      rationale,
      directReplyRef: replyRef,
      followUpEvidenceRef: null,
      verificationRefs: [],
      settledAt: input.settledAt,
    },
  });
  const dispositionReceipt = await deps.appendAndConfirm(candidate, input.expectedLedgerVersion);
  if (dispositionReceipt.receiptHash !== candidate.receiptHash || dispositionReceipt.action !== input.disposition) {
    throw new Error("disposition-receipt-not-canonical");
  }
  const thread = await deps.ensureResolution();
  if (!thread.isResolved || thread.threadId !== input.threadId
    || thread.resolvedByActorIdentity !== input.actorIdentity) throw new Error("canonical-thread-resolution-mismatch");
  const hostEvidenceRef = `github-review-thread:${thread.threadId}:resolved`;
  const resolutionCandidate = createReceipt({
    eventId: `conversation-resolved:${input.request.sourceIdentity}:${input.findingId}:${input.headSha}`,
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
      headSha: input.headSha,
      threadId: input.threadId,
      resolvedByActorIdentity: input.actorIdentity,
      dispositionReceiptHash: dispositionReceipt.receiptHash,
      hostEvidenceRef,
      resolvedAt: input.settledAt,
    },
  });
  const resolved = await deps.appendAndConfirm(resolutionCandidate, input.expectedLedgerVersion + 1);
  if (resolved.receiptHash !== resolutionCandidate.receiptHash) throw new Error("resolution-receipt-not-canonical");
  return { disposition: dispositionReceipt, resolved };
}

/** Record only a qualified source's explicit closure relation; no coordinator impersonation or host flag. */
export async function recordProviderClosure(input: {
  request: ReviewRequest;
  findingId: string;
  findingHeadSha: string;
  evidence: Evidence;
  qualifiedClosureSources: string[];
  expectedLedgerVersion: number;
  settledAt: string;
}, deps: SettlementReceiptPort): Promise<ReviewReceipt> {
  const closure = input.evidence.closures.find((candidate) => candidate.findingId === input.findingId
    && candidate.authorityIdentity === input.request.sourceIdentity);
  if (!input.qualifiedClosureSources.includes(input.request.sourceIdentity)
    || input.evidence.sourceIdentity !== input.request.sourceIdentity
    || closure === undefined) throw new Error("unqualified-provider-closure");
  const candidate = createReceipt({
    eventId: `provider-closed:${input.request.sourceIdentity}:${input.findingId}:${input.evidence.headSha}`,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: "provider-closed",
    request: input.request,
    result: null,
    evidenceUrlOrId: closure.evidenceUrlOrId,
    findingIds: [input.findingId],
    payload: {
      kind: "finding-disposition",
      disposition: "provider-closed",
      findingId: input.findingId,
      sourceIdentity: input.request.sourceIdentity,
      oldHeadSha: input.findingHeadSha,
      fixHeadSha: null,
      actorIdentity: input.request.sourceIdentity,
      rationale: null,
      directReplyRef: null,
      followUpEvidenceRef: closure.evidenceUrlOrId,
      verificationRefs: [],
      settledAt: input.settledAt,
    },
  });
  const canonical = await deps.appendAndConfirm(candidate, input.expectedLedgerVersion);
  if (canonical.receiptHash !== candidate.receiptHash || canonical.action !== "provider-closed") {
    throw new Error("provider-closure-receipt-not-canonical");
  }
  return canonical;
}
