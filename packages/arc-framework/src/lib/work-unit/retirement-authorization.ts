/**
 * Read-only authorization and immediate revalidation for terminal retirement.
 *
 * This layer composes exact projection ownership, committed evidence, receipt
 * relation validation, and remote-ref intent into one versioned decision. It
 * performs no detach, delete, or other directional mutation.
 */

import { canonicalDigest } from "../canonical/canonical-json.js";
import {
  retirementSubjectRefusal,
  validateReceiptMatrix,
  worktreeSubjectsEqual,
  type RetirementEvidenceRef,
  type RetirementReceipt,
  type TeardownAuthorizationDecision,
  type TeardownAuthorizationRefusal,
  type TeardownAuthorizationRequest,
} from "./retirement-authority.js";

/** One deterministic non-shipped receipt candidate and its result projection. */
export interface RetirementReceiptCandidate {
  receipt: RetirementReceipt;
  resultHead: string;
}

/** Read-only seams needed to authorize one exact teardown request. */
export interface RetirementAuthorizationContext {
  readLocalProjection(request: TeardownAuthorizationRequest): Promise<{
    oid: string;
    ownedByRetiringWorktree: boolean;
  }>;
  readRemoteRef(remote: string, branch: string): Promise<string | null>;
  readShippedEvidence(request: TeardownAuthorizationRequest): Promise<
    | {
        evidence: Extract<RetirementEvidenceRef, { kind: "shipped" }>;
        remoteDisposition: "delete" | "retain";
      }
    | null
  >;
  readReceiptCandidates(request: TeardownAuthorizationRequest): Promise<readonly RetirementReceiptCandidate[]>;
  validateReceiptRelation(
    receipt: RetirementReceipt,
    projection: { retiringHead: string; resultHead: string },
  ): Promise<TeardownAuthorizationRefusal | null>;
  validateReceiptResult(
    receipt: RetirementReceipt,
    projection: { retiringHead: string; resultHead: string },
  ): Promise<TeardownAuthorizationRefusal | null>;
}

/**
 * Authorize one exact live retirement request from committed evidence and refs.
 *
 * @param ctx - Projection and evidence readers
 * @param request - Exact subject, branch, head, remote, and requested mode
 * @returns A versioned authorization or closed semantic refusal
 */
export async function authorizeRetirement(
  ctx: RetirementAuthorizationContext,
  request: TeardownAuthorizationRequest,
): Promise<TeardownAuthorizationDecision> {
  const subjectRefusal = retirementSubjectRefusal(request.subject);
  if (subjectRefusal !== null) return { status: "refused", reason: subjectRefusal };
  if (request.subject.kind === "branch" && request.subject.ref !== request.branch) {
    return { status: "refused", reason: "projection-mismatch" };
  }
  if (request.subject.kind === "branch" && request.requestedMode !== "shipped") {
    return { status: "refused", reason: "unsupported-transition" };
  }

  try {
    const [local, remoteOid] = await Promise.all([
      ctx.readLocalProjection(request),
      ctx.readRemoteRef(request.remote, request.branch),
    ]);
    if (local.oid !== request.head || !local.ownedByRetiringWorktree) {
      return { status: "refused", reason: "projection-mismatch" };
    }
    if (remoteOid !== null && remoteOid !== request.head) {
      return { status: "refused", reason: "projection-mismatch" };
    }

    if (request.requestedMode === "shipped") {
      return await authorizeShipped(ctx, request, local.oid, remoteOid);
    }
    return await authorizeFromReceipt(ctx, request, local.oid, remoteOid);
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

/**
 * Repeat authorization immediately before the first directional operation.
 *
 * @param ctx - Projection and evidence readers
 * @param request - Original exact teardown request
 * @param proof - Previously returned authorization
 * @returns `valid` only when version and refs remain byte-identical
 */
export async function revalidateRetirementAuthorization(
  ctx: RetirementAuthorizationContext,
  request: TeardownAuthorizationRequest,
  proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
): Promise<
  | { status: "valid" }
  | { status: "refused"; reason: TeardownAuthorizationRefusal }
> {
  const current = await authorizeRetirement(ctx, request);
  if (current.status !== "authorized") {
    return { status: "refused", reason: "authority-conflict" };
  }
  if (
    current.authorityVersion !== proof.authorityVersion
    || current.refs.localOid !== proof.refs.localOid
    || !remoteProofsEqual(current.refs.remote, proof.refs.remote)
  ) {
    return { status: "refused", reason: "authority-conflict" };
  }
  return { status: "valid" };
}

async function authorizeShipped(
  ctx: RetirementAuthorizationContext,
  request: TeardownAuthorizationRequest,
  localOid: string,
  remoteOid: string | null,
): Promise<TeardownAuthorizationDecision> {
  const shipped = await ctx.readShippedEvidence(request);
  if (shipped === null) return { status: "refused", reason: "evidence-missing" };
  const refs = {
    localOid,
    remote: remoteOid === null
      ? null
      : {
          remote: request.remote,
          oid: remoteOid,
          disposition: shipped.remoteDisposition,
        },
  } as const;
  return authorizedDecision(request, "merged-preserved", shipped.evidence, refs);
}

async function authorizeFromReceipt(
  ctx: RetirementAuthorizationContext,
  request: TeardownAuthorizationRequest,
  localOid: string,
  remoteOid: string | null,
): Promise<TeardownAuthorizationDecision> {
  if (request.subject.kind !== "work-unit") {
    return { status: "refused", reason: "unsupported-transition" };
  }
  const candidates = await ctx.readReceiptCandidates(request);
  if (candidates.length === 0) return { status: "refused", reason: "evidence-missing" };
  if (candidates.length > 1) return { status: "refused", reason: "authority-ambiguous" };
  const candidate = candidates[0];
  if (candidate === undefined) return { status: "refused", reason: "evidence-missing" };
  const { receipt } = candidate;
  if (!worktreeSubjectsEqual(receipt.subject, request.subject) || receipt.source.branch !== request.branch) {
    return { status: "refused", reason: "evidence-mismatch" };
  }
  const expectedLifecycle = receipt.transition === "park-planning" ? "planned" : "nonexistent";
  const matrixRefusal = validateReceiptMatrix(receipt, expectedLifecycle);
  if (matrixRefusal !== null) return { status: "refused", reason: matrixRefusal };
  const relationRefusal = await ctx.validateReceiptRelation(receipt, {
    retiringHead: request.head,
    resultHead: candidate.resultHead,
  });
  if (relationRefusal !== null) return { status: "refused", reason: relationRefusal };
  const resultRefusal = await ctx.validateReceiptResult(receipt, {
    retiringHead: request.head,
    resultHead: candidate.resultHead,
  });
  if (resultRefusal !== null) return { status: "refused", reason: resultRefusal };

  const evidence: Extract<RetirementEvidenceRef, { kind: "receipt" }> = {
    kind: "receipt",
    receiptId: receipt.receiptId,
    transition: receipt.transition,
    expectedLifecycle,
    resultDigest: canonicalDigest(receipt.result),
  };
  const refs = {
    localOid,
    remote: remoteOid === null
      ? null
      : {
          remote: request.remote,
          oid: remoteOid,
          disposition: "delete" as const,
        },
  };
  return authorizedDecision(request, receipt.authorization, evidence, refs);
}

function authorizedDecision(
  request: TeardownAuthorizationRequest,
  authorization: Extract<TeardownAuthorizationDecision, { status: "authorized" }>["authorization"],
  evidence: RetirementEvidenceRef,
  refs: Extract<TeardownAuthorizationDecision, { status: "authorized" }>["refs"],
): Extract<TeardownAuthorizationDecision, { status: "authorized" }> {
  return {
    status: "authorized",
    authorization,
    authorityVersion: canonicalDigest({ request, authorization, evidence, refs }),
    evidence,
    refs,
  };
}

function remoteProofsEqual(
  left: Extract<TeardownAuthorizationDecision, { status: "authorized" }>["refs"]["remote"],
  right: Extract<TeardownAuthorizationDecision, { status: "authorized" }>["refs"]["remote"],
): boolean {
  if (left === null || right === null) return left === right;
  return left.remote === right.remote && left.oid === right.oid && left.disposition === right.disposition;
}
