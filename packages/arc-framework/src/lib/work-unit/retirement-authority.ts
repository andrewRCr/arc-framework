/**
 * Retirement-authority contract for terminal worktree cleanup.
 *
 * The public vocabulary describes preservation evidence rather than lifecycle
 * state. Teardown consumes only typed authorization decisions and never
 * inspects adapter storage directly.
 */

import { canonicalDigest, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import type { ManagedPath } from "../kernel/canonical/managed-path.js";
import { assertNever } from "../kernel/index.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";

type DirectRetirementTransition = "abandon" | "park-planning" | "rename";

/** Preservation fact that can authorize a terminal worktree transition. */
export type HuskAuthorization = "merged-preserved" | "discard-confirmed" | "planning-relocated";

/** Proof about the requested remote ref at authorization time. */
export type RemoteRefProof =
  | null
  | {
      remote: string;
      oid: string;
      disposition: "delete" | "retain";
    };

/** Stable evidence reference carried into the terminal worktree stamp. */
export type RetirementEvidenceRef =
  | {
      kind: "shipped";
      expectedLifecycle: "completed";
      resultDigest: CanonicalDigest;
      baseProofOid: string;
    }
  | {
      kind: "git-transition";
      transition: "abandon" | "park-planning";
      resultDigest: CanonicalDigest;
    };

/** Lifecycle result derived from a receipt-free Git transition kind. */
export function gitTransitionExpectedLifecycle(
  transition: Extract<RetirementEvidenceRef, { kind: "git-transition" }>["transition"],
): "planned" | "nonexistent" {
  return transition === "park-planning" ? "planned" : "nonexistent";
}

/** Inputs bound into one replay-stable Git transition result digest. */
export interface GitTransitionResultDigestInput {
  transition: Extract<RetirementEvidenceRef, { kind: "git-transition" }>["transition"];
  subject: WorktreeSubject;
  branch: string;
  retiringHead: string;
  resultHead: string;
  resultInventory: readonly { path: ManagedPath; contentDigest: CanonicalDigest }[];
}

/** Digest one pinned receipt-free transition result for authorization and replay. */
export function gitTransitionResultDigest(input: GitTransitionResultDigestInput): CanonicalDigest {
  return canonicalDigest({
    domain: "arc.git-transition-result",
    schemaVersion: 1,
    transition: input.transition,
    subject: input.subject,
    branch: input.branch,
    retiringHead: input.retiringHead,
    resultHead: input.resultHead,
    expectedLifecycle: gitTransitionExpectedLifecycle(input.transition),
    resultInventory: [...input.resultInventory]
      .sort((left, right) => Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")))
      .map(({ path, contentDigest }) => ({ path, contentDigest })),
  });
}

/** Persisted evidence preserves unknown future kinds without authorizing them. */
export type PersistedRetirementEvidence =
  | RetirementEvidenceRef
  | ({ kind: string } & Readonly<Record<string, unknown>>);

/** Result of decoding known or forward-compatible retirement evidence. */
export type DecodedRetirementEvidence =
  | { kind: "known"; value: RetirementEvidenceRef }
  | {
      kind: "unknown";
      value: { kind: string } & Readonly<Record<string, unknown>>;
    };

/** Exact source and result projections bound by an authority snapshot. */
export interface RetirementAuthorityScope {
  subject: WorktreeSubject;
  transition: DirectRetirementTransition;
  source: {
    branch: string;
    head: string;
  };
  resultProjection: {
    ref: string;
    head: string;
  };
}

/** Opaque compare-and-set snapshot returned before a driver mutates state. */
export interface RetirementAuthoritySnapshot {
  authorityVersion: string;
  sourceRefOid: string;
  resultRefOid: string;
}

/** Exact live teardown request. */
export interface TeardownAuthorizationRequest {
  subject: WorktreeSubject;
  branch: string;
  head: string;
  remote: string;
  requestedMode: "shipped" | "abandoned";
}

/** Closed semantic refusal set consumed by orchestration and rendering. */
export type TeardownAuthorizationRefusal =
  | "unsupported-transition"
  | "evidence-missing"
  | "evidence-mismatch"
  | "projection-mismatch"
  | "conservation-unproven"
  | "preservation-unproven"
  | "authority-unavailable"
  | "authority-ambiguous"
  | "authority-conflict";

/** Authorized proof or one semantic refusal. */
export type TeardownAuthorizationDecision =
  | {
      status: "authorized";
      authorization: HuskAuthorization;
      authorityVersion: string;
      evidence: RetirementEvidenceRef;
      refs: {
        localOid: string;
        remote: RemoteRefProof;
      };
    }
  | {
      status: "refused";
      reason: TeardownAuthorizationRefusal;
    };

/** Storage-agnostic authority boundary shared by lifecycle drivers and teardown. */
export interface RetirementAuthorityPort {
  readSnapshot(scope: RetirementAuthorityScope): Promise<
    | { status: "resolved"; snapshot: RetirementAuthoritySnapshot }
    | { status: "refused"; reason: TeardownAuthorizationRefusal; diagnostic?: string }
  >;

  authorize(request: TeardownAuthorizationRequest): Promise<TeardownAuthorizationDecision>;

  revalidate(
    request: TeardownAuthorizationRequest,
    proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  ): Promise<
    | { status: "valid" }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;
}

/**
 * Compare typed worktree subjects without collapsing their identity domains.
 *
 * @param left - First worktree subject
 * @param right - Second worktree subject
 * @returns Whether both subjects have the same kind and value
 */
export function worktreeSubjectsEqual(left: WorktreeSubject, right: WorktreeSubject): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "work-unit":
      return right.kind === "work-unit" && left.name === right.name;
    case "errand":
      return right.kind === "errand" && left.slug === right.slug;
    case "branch":
      return right.kind === "branch" && left.ref === right.ref;
  }
}

/**
 * Return the subject-level refusal for transitions unsupported by this port.
 *
 * @param subject - Typed worktree subject
 * @returns A semantic refusal, or `null` when the subject is supported
 */
export function retirementSubjectRefusal(subject: WorktreeSubject): TeardownAuthorizationRefusal | null {
  return subject.kind === "errand" ? "unsupported-transition" : null;
}

/**
 * Render one stable diagnostic for every semantic refusal.
 *
 * @param reason - Closed refusal code
 * @returns Human-readable diagnostic
 */
export function describeTeardownAuthorizationRefusal(reason: TeardownAuthorizationRefusal): string {
  switch (reason) {
    case "unsupported-transition":
      return "unsupported transition";
    case "evidence-missing":
      return "retirement evidence is missing";
    case "evidence-mismatch":
      return "retirement evidence does not match the requested transition";
    case "projection-mismatch":
      return "the live branch projection does not match the request";
    case "conservation-unproven":
      return "content conservation is not proven";
    case "preservation-unproven":
      return "preservation is not proven";
    case "authority-unavailable":
      return "retirement authority is unavailable";
    case "authority-ambiguous":
      return "retirement authority found conflicting evidence";
    case "authority-conflict":
      return "retirement authority changed during the operation";
    default:
      return assertNever(reason);
  }
}
