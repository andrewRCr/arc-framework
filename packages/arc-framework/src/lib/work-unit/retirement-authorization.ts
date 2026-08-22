/**
 * Read-only authorization and immediate revalidation for terminal retirement.
 *
 * This layer composes exact projection ownership, committed evidence, receipt
 * relation validation, and remote-ref intent into one versioned decision. It
 * performs no detach, delete, or other directional mutation.
 */

import { canonicalDigest } from "../canonical/canonical-json.js";
import {
  gitTransitionResultDigest,
  retirementSubjectRefusal,
  type RetirementEvidenceRef,
  type TeardownAuthorizationDecision,
  type TeardownAuthorizationRefusal,
  type TeardownAuthorizationRequest,
} from "./retirement-authority.js";

/** Git-derived non-shipped transition proof ready for digest binding. */
export interface GitTransitionAuthorizationProof {
  transition: Extract<RetirementEvidenceRef, { kind: "git-transition" }>["transition"];
  retiringHead: string;
  resultHead: string;
  resultInventory: Parameters<typeof gitTransitionResultDigest>[0]["resultInventory"];
}

/** Read-only seams needed to authorize one exact teardown request. */
export interface RetirementAuthorizationContext {
  readLocalProjection(request: TeardownAuthorizationRequest): Promise<{
    oid: string;
    worktreeProjectionSafe: boolean;
  }>;
  readRemoteRef(remote: string, branch: string): Promise<string | null>;
  readShippedEvidence(request: TeardownAuthorizationRequest): Promise<
    | {
        evidence: Extract<RetirementEvidenceRef, { kind: "shipped" }>;
        remoteDisposition: "delete" | "retain";
      }
    | null
  >;
  readGitTransitionProof(request: TeardownAuthorizationRequest): Promise<
    | { status: "proved"; proof: GitTransitionAuthorizationProof }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;
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
  try {
    return await authorizeRetirementStrict(ctx, request);
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

/** Authorize retirement while preserving unexpected evidence-read failures. */
export async function authorizeRetirementStrict(
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

  if (request.requestedMode === "shipped") {
    const [local, remoteOid] = await Promise.all([
      ctx.readLocalProjection(request),
      ctx.readRemoteRef(request.remote, request.branch),
    ]);
    if (local.oid !== request.head || !local.worktreeProjectionSafe) {
      return { status: "refused", reason: "projection-mismatch" };
    }
    if (remoteOid !== null && remoteOid !== request.head) {
      return { status: "refused", reason: "projection-mismatch" };
    }
    return await authorizeShipped(ctx, request, local.oid, remoteOid);
  }
  const transition = await ctx.readGitTransitionProof(request);
  if (transition.status === "refused") return transition;
  const [local, remoteOid] = await Promise.all([
    ctx.readLocalProjection(request),
    ctx.readRemoteRef(request.remote, request.branch),
  ]);
  if (local.oid !== request.head || !local.worktreeProjectionSafe) {
    return { status: "refused", reason: "projection-mismatch" };
  }
  if (remoteOid !== null && remoteOid !== request.head) {
    return { status: "refused", reason: "projection-mismatch" };
  }
  return authorizeFromGitTransition(request, local.oid, remoteOid, transition.proof);
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

function authorizeFromGitTransition(
  request: TeardownAuthorizationRequest,
  localOid: string,
  remoteOid: string | null,
  proof: GitTransitionAuthorizationProof,
): TeardownAuthorizationDecision {
  if (request.subject.kind !== "work-unit") {
    return { status: "refused", reason: "unsupported-transition" };
  }
  if (proof.retiringHead !== request.head) {
    return { status: "refused", reason: "projection-mismatch" };
  }
  const authorization = proof.transition === "park-planning"
    ? "planning-relocated"
    : "discard-confirmed";
  const evidence: Extract<RetirementEvidenceRef, { kind: "git-transition" }> = {
    kind: "git-transition",
    transition: proof.transition,
    resultDigest: gitTransitionResultDigest({
      transition: proof.transition,
      subject: request.subject,
      branch: request.branch,
      retiringHead: proof.retiringHead,
      resultHead: proof.resultHead,
      resultInventory: proof.resultInventory,
    }),
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
  return authorizedDecision(request, authorization, evidence, refs);
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
