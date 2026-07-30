/** Deterministic reconciliation summaries with exact internal mutation proofs. */

import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { LocusLockReadResult } from "./lock.js";
import type { ProcessLiveness } from "./process-inspector.js";
import type { LocusRecordReadResult } from "./record-store.js";
import type {
  LocusAnchor,
  LocusDiagnosticV1,
  LocusIdentityV1,
  LocusReconcileAction,
  LocusRowV1,
  LocusStateV1,
  LocusStopReason,
} from "./schema/index.js";

type TransientWorktreeSubject = {
  readonly kind: "errand" | "groom" | "housekeep";
  readonly slug: string;
  readonly claimId: string;
};

type ReconciliationMarkerGeneration =
  | {
      readonly kind: "present";
      readonly marker: {
        readonly spawnedByArc: boolean;
        readonly createdAt: string;
        readonly createdFor?: unknown;
        readonly provisioning?: unknown;
        readonly spawningIdentity: string;
      };
      readonly bytes: Buffer;
    }
  | { readonly kind: "absent" }
  | { readonly kind: "malformed"; readonly message: string; readonly path: string };

interface RecordReconciliationEvidence {
  readonly kind: "record";
  readonly name: string;
  readonly digest: string;
  readonly path: string;
  readonly result: LocusRecordReadResult;
  readonly canonical?: { readonly kind: "resolved"; readonly path: string }
    | { readonly kind: "error"; readonly message: string };
  readonly liveness?: ProcessLiveness;
}

interface LockReconciliationEvidence {
  readonly kind: "lock";
  readonly name: string;
  readonly digest: string;
  readonly path: string;
  readonly result: LocusLockReadResult | { readonly kind: "unreadable"; readonly message: string };
  readonly liveness?: ProcessLiveness;
}

export type LocusRecordGenerationProof =
  | { readonly kind: "record-absent"; readonly path: string }
  | { readonly kind: "record-present"; readonly path: string; readonly bytes: Buffer };

export interface LocusLockGenerationProof {
  readonly kind: "lock-present";
  readonly path: string;
  readonly bytes: Buffer;
  readonly token: string;
  readonly anchor: LocusAnchor;
}

export interface LocusWorkUnitAdoptionAuthority {
  readonly kind: "work-unit";
  readonly marker: "verified";
  readonly subjectKey: string;
  readonly identityKey: null;
}

export interface LocusTransientAdoptionAuthority {
  readonly kind: "transient";
  readonly marker: {
    readonly bytes: Buffer;
    readonly subject: TransientWorktreeSubject;
  };
  readonly checkout: { readonly head: string; readonly branch: string };
  readonly identity: LocusIdentityV1;
}

export type LocusAdoptionAuthority = LocusWorkUnitAdoptionAuthority | LocusTransientAdoptionAuthority;

export type LocusTransientAdoptionEvidence =
  | { readonly kind: "identity-only" }
  | { readonly kind: "pending-marker"; readonly markerBytes: Buffer }
  | {
      readonly kind: "marker-record-mismatch";
      readonly markerBytes: Buffer | null;
      readonly recordBytes: Buffer | null;
    };

export type LocusTransientAuthorityRecheck =
  | { readonly kind: "matched"; readonly authority: LocusTransientAdoptionAuthority }
  | { readonly kind: "changed"; readonly evidence: LocusTransientAdoptionEvidence };

export type LocusInternalReconcileAction =
  | {
      readonly summary: LocusReconcileAction;
      readonly proof: LocusRecordGenerationProof;
      readonly authority: LocusAdoptionAuthority | null;
    }
  | {
      readonly summary: LocusReconcileAction;
      readonly proof: LocusLockGenerationProof;
      readonly authority: null;
    };

export type LocusAdoptionCandidate =
  | {
      readonly kind: "applicable";
      readonly action: "adopt-work-unit";
      readonly checkoutPath: string;
      readonly recordId: string;
      readonly proof: Extract<LocusRecordGenerationProof, { kind: "record-absent" }>;
      readonly marker: "verified";
      readonly subjectKey: string;
      readonly identityKey: null;
    }
  | {
      readonly kind: "applicable";
      readonly action: "adopt-transient";
      readonly checkoutPath: string;
      readonly recordId: string;
      readonly proof: Extract<LocusRecordGenerationProof, { kind: "record-absent" }>;
      readonly subjectKey: string;
      readonly identityKey: string;
      readonly authority: LocusTransientAdoptionAuthority;
    }
  | {
      readonly kind: "blocked";
      readonly checkoutPath: string;
      readonly recordId: string;
      readonly subjectKey: string;
      readonly identityKey: string | null;
      readonly reasons: readonly LocusStopReason[];
    };

export interface LocusReconciliationPlan {
  readonly reconciliation: LocusStateV1["reconciliation"];
  readonly internalActions: readonly LocusInternalReconcileAction[];
}

/** Derive one transient adoption candidate from exact local marker, identity, and checkout authority. */
export function deriveTransientAdoptionCandidate(options: {
  identity: string;
  checkout: RegisteredWorktree;
  marker: ReconciliationMarkerGeneration;
  identities: TransientIdentitySnapshot;
  recordId: string;
  recordPath: string;
}): LocusAdoptionCandidate | null {
  if (options.marker.kind !== "present") return null;
  const ownership = decodeTransientMarkerOwnership(options.marker.marker);
  if (ownership.kind === "unrelated") return null;
  if (ownership.kind === "blocked") {
    return blockedTransient(options, ownership.subjectKey, ["subject-unresolved"]);
  }
  const subject = ownership.subject;
  const reasons: LocusStopReason[] = [];
  if (ownership.provisioning !== "ready") reasons.push("subject-unresolved");
  if (options.marker.marker.spawningIdentity !== options.identity) reasons.push("cross-identity");
  if (options.checkout.primary || options.checkout.detached || options.checkout.branch === null) {
    reasons.push("subject-unresolved");
  }
  if (options.identities.kind !== "complete") {
    reasons.push("identity-malformed");
    return blockedTransient(options, subject.slug, reasons);
  }
  if (options.identities.diagnostics.some((diagnostic) => diagnostic.key === subject.slug)) {
    reasons.push("identity-malformed");
    return blockedTransient(options, subject.slug, reasons);
  }
  const identity = options.identities.projections.get(subject.slug);
  if (identity === undefined
    || !transientIdentityMatchesMarker(identity, subject)
    || identity.branch !== options.checkout.branch) {
    reasons.push("subject-unresolved");
  }
  if (reasons.length > 0 || identity === undefined || options.checkout.branch === null) {
    return blockedTransient(options, subject.slug, reasons);
  }
  return {
    kind: "applicable",
    action: "adopt-transient",
    checkoutPath: options.checkout.path,
    recordId: options.recordId,
    proof: { kind: "record-absent", path: options.recordPath },
    subjectKey: subject.slug,
    identityKey: subject.slug,
    authority: {
      kind: "transient",
      marker: { bytes: options.marker.bytes, subject },
      checkout: { head: options.checkout.head, branch: options.checkout.branch },
      identity,
    },
  };
}

function decodeTransientMarkerOwnership(
  marker: Extract<ReconciliationMarkerGeneration, { kind: "present" }>["marker"],
):
  | {
      readonly kind: "current";
      readonly subject: TransientWorktreeSubject;
      readonly provisioning: "pending" | "ready";
    }
  | { readonly kind: "blocked"; readonly subjectKey: string }
  | { readonly kind: "unrelated" } {
  if (typeof marker.createdFor !== "object" || marker.createdFor === null) {
    return { kind: "unrelated" };
  }
  const subject = marker.createdFor as Record<string, unknown>;
  if (subject.kind !== "errand" && subject.kind !== "groom" && subject.kind !== "housekeep") {
    return { kind: "unrelated" };
  }
  if (typeof subject.slug !== "string"
    || typeof subject.claimId !== "string"
    || (marker.provisioning !== "pending" && marker.provisioning !== "ready")) {
    return typeof subject.slug === "string"
      ? { kind: "blocked", subjectKey: subject.slug }
      : { kind: "unrelated" };
  }
  return {
    kind: "current",
    subject: {
      kind: subject.kind,
      slug: subject.slug,
      claimId: subject.claimId,
    },
    provisioning: marker.provisioning,
  };
}

function blockedTransient(
  options: Pick<Parameters<typeof deriveTransientAdoptionCandidate>[0], "checkout" | "recordId">,
  subjectKey: string,
  reasons: readonly LocusStopReason[],
): Extract<LocusAdoptionCandidate, { kind: "blocked" }> {
  return {
    kind: "blocked",
    checkoutPath: options.checkout.path,
    recordId: options.recordId,
    subjectKey,
    identityKey: subjectKey,
    reasons: uniqueStopReasons(reasons),
  };
}

function transientIdentityMatchesMarker(
  identity: LocusIdentityV1,
  subject: TransientWorktreeSubject,
): boolean {
  if (identity.key !== subject.slug || identity.claimId !== subject.claimId) return false;
  if (subject.kind === "groom") return identity.kind === "groom";
  if (identity.kind !== "errand") return false;
  return subject.kind === "housekeep"
    ? identity.purpose === "housekeep-routing"
    : identity.purpose === "errand";
}

function uniqueStopReasons(reasons: readonly LocusStopReason[]): LocusStopReason[] {
  return [...new Set(reasons)];
}

/**
 * Build public reconciliation guidance and the private generations that can apply it.
 * @param options - One bounded roster/evidence snapshot plus authority-derived adoption candidates.
 * @returns A deterministic public verdict and matching proof-bearing internal actions.
 */
export function deriveLocusReconciliation(options: {
  primaryPath: string;
  rows: readonly LocusRowV1[];
  diagnostics: readonly LocusDiagnosticV1[];
  current: LocusStateV1["current"];
  adoptionCandidates: readonly LocusAdoptionCandidate[];
  records: readonly RecordReconciliationEvidence[];
  locks: readonly LockReconciliationEvidence[];
  selected?: {
    readonly checkoutPaths?: readonly string[];
    readonly recordIds?: readonly string[];
    readonly identityKeys?: readonly string[];
  };
}): LocusReconciliationPlan {
  const internalActions: LocusInternalReconcileAction[] = [];
  const derivationStops: LocusStopReason[] = [];
  for (const candidate of options.adoptionCandidates) {
    if (candidate.kind !== "applicable") continue;
    internalActions.push({
      summary: {
        kind: candidate.action,
        checkoutPath: candidate.checkoutPath,
        recordId: candidate.recordId,
      },
      proof: candidate.proof,
      authority: candidate.action === "adopt-transient"
        ? candidate.authority
        : {
            kind: "work-unit",
            marker: candidate.marker,
            subjectKey: candidate.subjectKey,
            identityKey: candidate.identityKey,
          },
    });
  }
  for (const row of options.rows) {
    if (row.kind !== "stale-record" || row.recordId === null || row.lease?.state !== "dead") continue;
    const entry = options.records.find((candidate) => `sha256:${candidate.digest}` === row.recordId);
    if (entry === undefined || entry.result.kind !== "valid") {
      derivationStops.push("record-malformed");
      continue;
    }
    if (entry.liveness !== "dead") {
      derivationStops.push(entry.liveness === "live" ? "lease-live" : "lease-unknown");
      continue;
    }
    internalActions.push({
      summary: { kind: "reap-stale-record", checkoutPath: row.checkoutPath, recordId: row.recordId },
      proof: { kind: "record-present", path: entry.path, bytes: Buffer.from(entry.result.bytes) },
      authority: null,
    });
  }
  for (const lock of options.locks) {
    if (lock.liveness !== "dead") continue;
    if (lock.result.kind !== "valid") {
      derivationStops.push("lock-unknown");
      continue;
    }
    const recordId = `sha256:${lock.digest}`;
    const checkoutPath = options.rows.find((row) => row.recordId === recordId)?.checkoutPath ?? null;
    internalActions.push({
      summary: { kind: "break-dead-lock", checkoutPath, recordId },
      proof: {
        kind: "lock-present",
        path: lock.path,
        bytes: Buffer.from(lock.result.bytes),
        token: lock.result.holder.token,
        anchor: lock.result.holder.anchor,
      },
      authority: null,
    });
  }
  internalActions.sort(compareInternalActions);
  const relevantRecordIds = new Set(options.selected?.recordIds ?? []);
  const relevantCheckoutPaths = new Set(options.selected?.checkoutPaths ?? []);
  const relevantIdentityKeys = new Set(options.selected?.identityKeys ?? []);
  for (const candidate of options.adoptionCandidates) {
    relevantRecordIds.add(candidate.recordId);
    relevantCheckoutPaths.add(candidate.checkoutPath);
    if (candidate.identityKey !== null) relevantIdentityKeys.add(candidate.identityKey);
  }
  for (const action of internalActions) {
    if (action.summary.recordId !== null) relevantRecordIds.add(action.summary.recordId);
    if (action.summary.checkoutPath !== null) relevantCheckoutPaths.add(action.summary.checkoutPath);
  }
  for (const row of options.rows) {
    if (row.primary === true || row.checkoutPath === options.primaryPath) {
      if (row.recordId !== null) relevantRecordIds.add(row.recordId);
    }
  }
  if (options.current.kind === "resolved") {
    relevantRecordIds.add(options.current.activeRecordId);
    if (options.current.parentRecordId !== null) relevantRecordIds.add(options.current.parentRecordId);
    if (options.current.sessionHomeRecordId !== null) relevantRecordIds.add(options.current.sessionHomeRecordId);
  } else if (options.current.kind === "ambiguous") {
    for (const recordId of options.current.recordIds) relevantRecordIds.add(recordId);
  }

  const stopReasons: LocusStopReason[] = [];
  stopReasons.push(...derivationStops);
  if (options.current.kind === "ambiguous") stopReasons.push(...options.current.reasons);
  for (const candidate of options.adoptionCandidates) {
    if (candidate.kind === "blocked") {
      stopReasons.push(...(candidate.reasons.length === 0 ? ["subject-unresolved" as const] : candidate.reasons));
    }
  }
  const actionKeys = internalActions.map(({ summary }) =>
    `${summary.kind}\0${summary.checkoutPath ?? ""}\0${summary.recordId ?? ""}`);
  if (new Set(actionKeys).size !== actionKeys.length) stopReasons.push("duplicate-locus");
  if (options.rows.some((row) => row.kind === "duplicate-locus")
    || options.diagnostics.some((item) => item.code === "duplicate-locus")) {
    stopReasons.push("duplicate-locus");
  }
  if (options.diagnostics.some((item) =>
    item.code === "identity-malformed" && relevantIdentityKeys.has(item.source.key))) {
    stopReasons.push("identity-malformed");
  }
  for (const row of options.rows) {
    const relevant = row.primary === true
      || row.checkoutPath === options.primaryPath
      || (row.recordId !== null && relevantRecordIds.has(row.recordId))
      || (row.checkoutPath !== null && relevantCheckoutPaths.has(row.checkoutPath));
    if (!relevant) continue;
    stopReasons.push(...rowStopReasons(row));
    if (options.selected?.recordIds?.includes(row.recordId ?? "") === true
      && row.lease?.state === "live"
      && !(options.current.kind === "resolved" && options.current.activeRecordId === row.recordId)) {
      stopReasons.push("lease-live");
    }
    if (options.selected?.recordIds?.includes(row.recordId ?? "") === true
      && row.lease?.state === "unknown") {
      stopReasons.push("lease-unknown");
    }
  }
  for (const lock of options.locks) {
    const recordId = `sha256:${lock.digest}`;
    if (!relevantRecordIds.has(recordId)) continue;
    if (lock.liveness === "live") stopReasons.push("lock-live");
    else if (lock.liveness === "unknown" || lock.result.kind !== "valid") stopReasons.push("lock-unknown");
  }
  if (stopReasons.length > 0) {
    return {
      reconciliation: { kind: "stop", reasons: sortStopReasons(stopReasons) },
      internalActions: [],
    };
  }
  return internalActions.length === 0
    ? { reconciliation: { kind: "clean" }, internalActions }
    : {
        reconciliation: { kind: "apply", actions: internalActions.map((action) => action.summary) },
        internalActions,
      };
}

function rowStopReasons(row: LocusRowV1): LocusStopReason[] {
  const reasons = row.diagnostics.flatMap((item): LocusStopReason[] => {
    switch (item.code) {
      case "lease-unknown":
      case "record-malformed":
      case "unsupported-version":
      case "path-unavailable":
      case "duplicate-locus":
      case "cross-identity":
      case "marker-missing":
      case "subject-unresolved":
        return [item.code];
      default:
        return [];
    }
  });
  if (row.kind === "malformed-record"
    && !reasons.includes("record-malformed")
    && !reasons.includes("unsupported-version")) {
    reasons.push("record-malformed");
  }
  return reasons;
}

const STOP_REASON_RANK: Record<LocusStopReason, number> = {
  "primary-dirty": 0,
  "primary-off-base": 1,
  "lease-live": 2,
  "lease-unknown": 3,
  "lock-live": 4,
  "lock-unknown": 5,
  "role-conflict": 6,
  "record-malformed": 7,
  "unsupported-version": 8,
  "identity-malformed": 9,
  "path-unavailable": 10,
  "duplicate-locus": 11,
  "cross-identity": 12,
  "marker-missing": 13,
  "subject-unresolved": 14,
};

function sortStopReasons(reasons: readonly LocusStopReason[]): LocusStopReason[] {
  return [...new Set(reasons)].sort((left, right) => STOP_REASON_RANK[left] - STOP_REASON_RANK[right]);
}

function compareInternalActions(
  left: LocusInternalReconcileAction,
  right: LocusInternalReconcileAction,
): number {
  return compareUtf8(left.summary.kind, right.summary.kind)
    || compareUtf8(left.summary.checkoutPath ?? "", right.summary.checkoutPath ?? "")
    || compareUtf8(left.summary.recordId ?? "", right.summary.recordId ?? "");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
