/** Developer-authenticated change-request lifecycle truth for transient identity tails. */

import type { GitExec } from "../git/exec.js";
import type { LocusChangeRequestV1 } from "../locus/schema/index.js";
import {
  serializeTransientIdentityRecord,
  type TransientIdentityRecord,
  type TransientIdentityRecordV3,
} from "./identity-record.js";
import type { IdentityTransformDecision } from "./identity-transaction.js";

const lifecycleEvidenceBrand: unique symbol = Symbol("ChangeRequestLifecycleEvidence");
const DEFAULT_TIMEOUT_MS = 10_000;
const QUERY_LIMIT = 100;

/** Repository authority configured for a lifecycle read. */
export type ChangeRequestLifecycleConfiguration = Pick<
  LocusChangeRequestV1,
  "repositoryRef" | "hostRef" | "baseRef"
>;

/** Closed host-truth vocabulary consumed by identity retirement and operational re-entry. */
export type ChangeRequestLifecycleTruth =
  | "merged"
  | "requested-work"
  | "open"
  | "closed-unmerged"
  | "changed-head"
  | "missing"
  | "ambiguous"
  | "unreachable";

/** Nominal host evidence bound to the exact stored change-request coordinates. */
export interface ChangeRequestLifecycleEvidence {
  readonly [lifecycleEvidenceBrand]: true;
  readonly kind: ChangeRequestLifecycleTruth;
  readonly changeRequest: LocusChangeRequestV1;
}

/** Narrow lifecycle read port used by ordinary commands. */
export interface ChangeRequestLifecyclePort {
  read(
    configured: ChangeRequestLifecycleConfiguration,
    changeRequest: LocusChangeRequestV1,
  ): Promise<ChangeRequestLifecycleEvidence>;
}

/** Operational re-entry verdict for a retained change-request generation. */
export type ChangeRequestReentryVerdict =
  | { readonly kind: "authorized"; readonly advisory?: string }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Authorize a non-retiring re-entry from exact or explicitly advisory host truth.
 *
 * @param lifecycle - Host observation bound to the stored change-request coordinates.
 * @param expected - Exact retained change-request generation.
 * @returns Authorization with optional operator guidance, or a refusal that preserves the tail.
 */
export function evaluateChangeRequestReentry(
  lifecycle: ChangeRequestLifecycleEvidence,
  expected: LocusChangeRequestV1,
): ChangeRequestReentryVerdict {
  if (!sameChangeRequest(lifecycle.changeRequest, expected)) {
    return { kind: "refused", reason: "Host truth does not match the retained change request." };
  }
  if (lifecycle.kind === "open" || lifecycle.kind === "requested-work") return { kind: "authorized" };
  if (lifecycle.kind === "changed-head") {
    return {
      kind: "authorized",
      advisory: "The change request is still open, but its head moved. Resume uses the recorded head; "
        + "inspect the host change before continuing.",
    };
  }
  if (lifecycle.kind === "unreachable") {
    return {
      kind: "authorized",
      advisory: "The change-request host is unreachable. Confirm the recorded change request is still open "
        + "before continuing.",
    };
  }
  return { kind: "refused", reason: `Host truth is ${lifecycle.kind}, not an open change request.` };
}

/** Resolve the configured origin repository and base for an exact host read. */
export async function resolveChangeRequestLifecycleConfiguration(
  exec: GitExec,
  baseRef: string,
): Promise<ChangeRequestLifecycleConfiguration | null> {
  let url: string;
  try {
    url = (await exec("git", ["config", "--get", "remote.origin.url"])).stdout.trim();
  } catch {
    return null;
  }
  const https = /^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const scp = /^(?:[^@]+@)?([^:]+):([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const match = https ?? scp;
  const hostRef = match?.[1];
  const repositoryRef = match?.[2];
  return hostRef !== undefined && repositoryRef !== undefined && baseRef !== ""
    ? { hostRef, repositoryRef, baseRef }
    : null;
}

/** Any v3 transient identity whose local locus has become a change-request tail. */
export type TransientIdentityTailRecord = Extract<
  TransientIdentityRecordV3,
  { state: "awaiting-merge" }
>;

/** Exact host-authorized tail retirement request. */
export interface TransientTailRetirementRequest {
  readonly previous: TransientIdentityTailRecord;
  readonly action: "finalize" | "abandon";
  readonly lifecycle: ChangeRequestLifecycleEvidence;
}

interface GhPullRequestLifecycle {
  readonly number: number;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly headRefOid: string;
  readonly reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "" | null;
}

/**
 * Build a `gh pr list`-backed developer-authenticated lifecycle port.
 *
 * @param exec - Argument-array process seam used for the GitHub CLI.
 * @param timeoutMs - Bound for the host query.
 * @returns A narrow port returning only closed lifecycle truth.
 */
export function createGhChangeRequestLifecyclePort(
  exec: GitExec,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ChangeRequestLifecyclePort {
  return {
    read: async (configured, changeRequest) => {
      if (!coordinatesValid(configured, changeRequest)) return evidence("ambiguous", changeRequest);
      const repository = configured.hostRef === "github.com"
        ? configured.repositoryRef
        : `${configured.hostRef}/${configured.repositoryRef}`;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        const branchQuery = await queryLifecyclePulls(exec, [
          "pr", "list",
          "--repo", repository,
          "--state", "all",
          "--head", changeRequest.headRef,
          "--limit", String(QUERY_LIMIT),
          "--json", "number,state,baseRefName,headRefName,headRefOid,reviewDecision",
        ], controller.signal);
        if (branchQuery.kind !== "ok") return evidence(branchQuery.kind, changeRequest);
        const branchPulls = branchQuery.pulls;
        if (branchPulls.length >= QUERY_LIMIT) return evidence("ambiguous", changeRequest);
        const coordinates = branchPulls.filter((pull) => pull.baseRefName === changeRequest.baseRef
          && pull.headRefName === changeRequest.headRef);
        if (coordinates.length > 0) return classifyExactCoordinates(coordinates, changeRequest);

        const movedQuery = await queryLifecyclePulls(exec, [
          "pr", "list",
          "--repo", repository,
          "--state", "all",
          "--search", changeRequest.headSha,
          "--limit", String(QUERY_LIMIT),
          "--json", "number,state,baseRefName,headRefName,headRefOid,reviewDecision",
        ], controller.signal);
        if (movedQuery.kind !== "ok") return evidence(movedQuery.kind, changeRequest);
        const movedPulls = movedQuery.pulls;
        if (movedPulls.length >= QUERY_LIMIT) return evidence("ambiguous", changeRequest);
        const moved = movedPulls.filter((pull) => pull.baseRefName === changeRequest.baseRef
          && pull.headRefOid === changeRequest.headSha);
        if (moved.length === 0) return evidence("missing", changeRequest);
        return evidence(moved.length === 1 && moved[0]?.state === "OPEN" ? "changed-head" : "ambiguous", changeRequest);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function queryLifecyclePulls(
  exec: GitExec,
  args: string[],
  signal: AbortSignal,
): Promise<
  | { kind: "ok"; pulls: GhPullRequestLifecycle[] }
  | { kind: "ambiguous" | "unreachable" }
> {
  let stdout: string;
  try {
    ({ stdout } = await exec("gh", args, { signal }));
  } catch {
    return { kind: "unreachable" };
  }
  try {
    return { kind: "ok", pulls: parseLifecyclePulls(stdout) };
  } catch {
    return { kind: "ambiguous" };
  }
}

function classifyExactCoordinates(
  coordinates: readonly GhPullRequestLifecycle[],
  changeRequest: LocusChangeRequestV1,
): ChangeRequestLifecycleEvidence {
  const exact = coordinates.filter((pull) => pull.headRefOid === changeRequest.headSha);
  if (exact.length === 0) {
    const open = coordinates.filter((pull) => pull.state === "OPEN");
    return evidence(open.length === 1 ? "changed-head" : "ambiguous", changeRequest);
  }
  if (exact.length !== 1) return evidence("ambiguous", changeRequest);
  const [current] = exact;
  if (current === undefined) return evidence("ambiguous", changeRequest);
  if (current.state === "MERGED") return evidence("merged", changeRequest);
  if (current.state === "OPEN") {
    return evidence(current.reviewDecision === "CHANGES_REQUESTED" ? "requested-work" : "open", changeRequest);
  }
  return evidence("closed-unmerged", changeRequest);
}

/**
 * Build an exact-generation tail retirement authorized only by matching host truth.
 *
 * @param request - Awaiting generation, requested disposition, and nominal lifecycle evidence.
 * @returns A complete-basis transaction transform.
 */
export function transientTailRetirementTransform(request: TransientTailRetirementRequest) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<null> => {
    const required = request.action === "finalize" ? "merged" : "closed-unmerged";
    if (request.lifecycle.kind !== required
      || !sameChangeRequest(request.lifecycle.changeRequest, request.previous.changeRequest)) {
      return { kind: "refused", reason: `Host truth does not authorize tail ${request.action}` };
    }
    const actual = basis.get(request.previous.slug);
    if (actual === undefined) return { kind: "idempotent", value: null };
    if (serializeTransientIdentityRecord(actual) !== serializeTransientIdentityRecord(request.previous)) {
      return { kind: "refused", reason: `Identity '${request.previous.slug}' changed before tail retirement` };
    }
    const records = new Map(basis);
    records.delete(request.previous.slug);
    return { kind: "applied", records, value: null };
  };
}

function coordinatesValid(
  configured: ChangeRequestLifecycleConfiguration,
  stored: LocusChangeRequestV1,
): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(configured.repositoryRef)
    && /^[A-Za-z0-9.-]+$/u.test(configured.hostRef)
    && configured.repositoryRef === stored.repositoryRef
    && configured.hostRef === stored.hostRef
    && configured.baseRef === stored.baseRef
    && configured.baseRef !== ""
    && stored.headRef !== ""
    && /^[0-9a-f]{40}$/u.test(stored.headSha);
}

function parseLifecyclePulls(stdout: string): GhPullRequestLifecycle[] {
  const value: unknown = JSON.parse(stdout);
  if (!Array.isArray(value)) throw new Error("GitHub lifecycle response must be an array");
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("GitHub lifecycle entry must be an object");
    }
    const record = item as Record<string, unknown>;
    const { number, state, baseRefName, headRefName, headRefOid, reviewDecision } = record;
    if (!Number.isSafeInteger(number) || (number as number) <= 0
      || (state !== "OPEN" && state !== "CLOSED" && state !== "MERGED")
      || typeof baseRefName !== "string" || baseRefName === ""
      || typeof headRefName !== "string" || headRefName === ""
      || typeof headRefOid !== "string" || !/^[0-9a-f]{40}$/u.test(headRefOid)
      || (reviewDecision !== null && reviewDecision !== "" && reviewDecision !== "APPROVED"
        && reviewDecision !== "CHANGES_REQUESTED" && reviewDecision !== "REVIEW_REQUIRED")) {
      throw new Error("GitHub lifecycle entry is malformed");
    }
    return {
      number: number as number,
      state,
      baseRefName,
      headRefName,
      headRefOid,
      reviewDecision,
    };
  });
}

function evidence(
  kind: ChangeRequestLifecycleTruth,
  changeRequest: LocusChangeRequestV1,
): ChangeRequestLifecycleEvidence {
  return { [lifecycleEvidenceBrand]: true, kind, changeRequest };
}

function sameChangeRequest(left: LocusChangeRequestV1, right: LocusChangeRequestV1): boolean {
  return left.repositoryRef === right.repositoryRef
    && left.hostRef === right.hostRef
    && left.baseRef === right.baseRef
    && left.headRef === right.headRef
    && left.headSha === right.headSha;
}
