/** Deterministic reconciliation summaries with exact internal mutation proofs. */

import type { LockEntryEvidence, RecordEntryEvidence } from "./evidence.js";
import type {
  LocusAnchor,
  LocusDiagnosticV1,
  LocusReconcileAction,
  LocusRowV1,
  LocusStateV1,
  LocusStopReason,
} from "./schema/index.js";

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

export type LocusInternalReconcileAction =
  | {
      readonly summary: LocusReconcileAction;
      readonly proof: LocusRecordGenerationProof;
      readonly authority: {
        readonly marker: "verified";
        readonly subjectKey: string;
        readonly identityKey: string | null;
      } | null;
    }
  | {
      readonly summary: LocusReconcileAction;
      readonly proof: LocusLockGenerationProof;
      readonly authority: null;
    };

export type LocusAdoptionCandidate =
  | {
      readonly kind: "applicable";
      readonly action: "adopt-work-unit" | "adopt-transient";
      readonly checkoutPath: string;
      readonly recordId: string;
      readonly proof: Extract<LocusRecordGenerationProof, { kind: "record-absent" }>;
      readonly marker: "verified";
      readonly subjectKey: string;
      readonly identityKey: string | null;
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
  records: readonly Extract<RecordEntryEvidence, { kind: "record" }>[];
  locks: readonly Extract<LockEntryEvidence, { kind: "lock" }>[];
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
      authority: {
        marker: candidate.marker,
        subjectKey: candidate.subjectKey,
        identityKey: candidate.identityKey,
      },
    });
  }
  for (const row of options.rows) {
    if (row.kind !== "stale-record" || row.recordId === null || row.lease?.state !== "dead") continue;
    const entry = options.records.find((candidate) =>
      `sha256:${candidate.digest}` === row.recordId
      && candidate.result.kind === "valid"
      && candidate.liveness === "dead");
    if (entry?.result.kind !== "valid") {
      derivationStops.push("record-malformed");
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
  const currentRecordId = options.current.kind === "resolved" ? options.current.activeRecordId : null;
  for (const lock of options.locks) {
    const recordId = `sha256:${lock.digest}`;
    if (!relevantRecordIds.has(recordId) || recordId === currentRecordId) continue;
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

const STOP_REASON_ORDER: readonly LocusStopReason[] = [
  "primary-dirty", "primary-off-base", "lease-live", "lease-unknown", "lock-live", "lock-unknown",
  "role-conflict", "record-malformed", "unsupported-version", "identity-malformed", "path-unavailable",
  "duplicate-locus", "cross-identity", "marker-missing", "subject-unresolved",
];

function sortStopReasons(reasons: readonly LocusStopReason[]): LocusStopReason[] {
  const unique = new Set(reasons);
  return STOP_REASON_ORDER.filter((reason) => unique.has(reason));
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
