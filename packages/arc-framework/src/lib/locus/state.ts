/** Pure frame and current-locus derivation over provisional roster rows. */

import { sameProcessAnchor } from "./process-inspector.js";
import type { ProvisionalLocusRow } from "./roster.js";
import type { PrimarySafetyResult } from "./primary-safety.js";
import type {
  LocusAnchor,
  LocusDiagnosticV1,
  LocusRowV1,
  LocusStateV1,
  LocusStopReason,
} from "./schema/index.js";

export interface LocusFrameDerivation {
  readonly rows: readonly LocusRowV1[];
  readonly current: LocusStateV1["current"];
}

export interface LocusOperationalDerivation {
  readonly primaryAvailability: LocusStateV1["primaryAvailability"];
  readonly inFlightIdentities: LocusStateV1["inFlightIdentities"];
  readonly recovery: LocusStateV1["recovery"];
}

export type CheckoutWorkUnitSelection =
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly recordIds: readonly string[] }
  | { readonly kind: "resolved"; readonly row: LocusRowV1 };

/**
 * Select the one retained work-unit role registered at a physical checkout.
 *
 * @param state - Reader-owned locus state containing the complete roster.
 * @param checkoutPath - Exact physical checkout path to select.
 * @returns The unique work-unit row, an ambiguity verdict, or no match.
 */
export function selectCheckoutWorkUnit(
  state: LocusStateV1,
  checkoutPath: string,
): CheckoutWorkUnitSelection {
  const matches = state.roster.rows.filter((row) => row.checkoutPath === checkoutPath);
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      recordIds: matches.flatMap((row) => row.recordId === null ? [] : [row.recordId]).sort(compareUtf8),
    };
  }
  const row = matches[0];
  return row?.kind === "managed-role"
    && row.recordId !== null
    && row.role?.kind === "work-unit"
    ? { kind: "resolved", row }
    : { kind: "none" };
}

/**
 * Test whether a row is the normal idle work-unit frame retained by its durable role.
 *
 * @param row - Public locus row to classify.
 * @returns `true` for a leaseless or conclusively dead-lease idle work-unit row.
 */
export function isIdleWorkUnitRow(row: LocusRowV1): boolean {
  return row.kind === "managed-role"
    && row.checkoutPath !== null
    && row.recordId !== null
    && row.role?.kind === "work-unit"
    && row.frame === "idle"
    && (row.lease === null || row.lease.state === "dead")
    && row.diagnostics.every((item) => item.code === "lease-dead");
}

/**
 * Derive allocation and recovery verdicts from one already-bounded locus snapshot.
 * @param options - Public rows plus directed primary and target-lock facts from the same read.
 * @returns Deterministic primary availability, identity actions, and recovery guidance.
 */
export function deriveLocusOperationalState(options: {
  primaryPath: string;
  rows: readonly LocusRowV1[];
  current: LocusStateV1["current"];
  primarySafety: Extract<PrimarySafetyResult, { kind: "complete" }>;
  primaryLock: "absent" | "live" | "dead" | "unknown";
}): LocusOperationalDerivation {
  return {
    primaryAvailability: derivePrimaryAvailability(options),
    inFlightIdentities: deriveInFlightIdentities(options.rows),
    recovery: deriveRecovery(options.rows, options.current),
  };
}

function deriveInFlightIdentities(rows: readonly LocusRowV1[]): LocusStateV1["inFlightIdentities"] {
  const identities = new Map<string, NonNullable<LocusRowV1["identity"]>>();
  for (const row of rows) {
    if (row.identity === null) continue;
    const key = `${row.identity.kind}\0${row.identity.key}\0${row.identity.claimId}`;
    if (!identities.has(key)) identities.set(key, row.identity);
  }
  return [...identities.values()]
    .sort((left, right) => compareUtf8(`${left.kind}\0${left.key}`, `${right.kind}\0${right.key}`))
    .map((identity) => ({
      identity,
      actions: actionsForIdentityState(identity.state),
    }));
}

/** A settled claim owes only its retirement, so it offers no resume. */
function actionsForIdentityState(
  state: NonNullable<LocusRowV1["identity"]>["state"],
): LocusStateV1["inFlightIdentities"][number]["actions"] {
  if (state === "awaiting-merge") return ["resume", "wait", "finalize", "abandon"];
  return state === "settled" ? ["finalize", "abandon"] : ["resume", "abandon"];
}

function deriveRecovery(
  rows: readonly LocusRowV1[],
  current: LocusStateV1["current"],
): LocusStateV1["recovery"] {
  const managed = rows.filter((row) => row.kind === "managed-role" && row.role !== null);
  const stopReasons = [
    ...(current.kind === "ambiguous" ? current.reasons : []),
    ...(managed.some((row) => row.lease?.state === "unknown") ? ["lease-unknown" as const] : []),
  ];
  if (stopReasons.length > 0) return { kind: "stop", reasons: sortStopReasons(stopReasons) };
  if (current.kind === "resolved") {
    return {
      kind: "resume",
      activeRecordId: current.activeRecordId,
      parentRecordId: current.parentRecordId,
    };
  }
  // An unsafe primary is an allocation fact, not a recovery verdict: the allocating verbs read
  // `primaryAvailability` themselves. Folding it in here would stop operations that never allocate
  // and hide a residual transient behind it.
  const transientResidue = managed.filter((row) =>
    row.role?.kind !== "work-unit" && (row.lease === null || row.lease.state === "dead"));
  if (transientResidue.length > 1) return { kind: "stop", reasons: ["role-conflict"] };
  const residue = transientResidue[0];
  if (residue?.recordId !== null && residue?.recordId !== undefined) {
    return { kind: "residue", recordId: residue.recordId, actions: ["resume", "abandon"] };
  }
  return { kind: "none" };
}

function derivePrimaryAvailability(options: {
  primaryPath: string;
  rows: readonly LocusRowV1[];
  primarySafety: Extract<PrimarySafetyResult, { kind: "complete" }>;
  primaryLock: "absent" | "live" | "dead" | "unknown";
}): LocusStateV1["primaryAvailability"] {
  const primaryRows = options.rows.filter((row) =>
    row.primary === true || row.checkoutPath === options.primaryPath);
  const primary = primaryRows.length === 1 ? primaryRows[0] : undefined;
  const reasons: LocusStopReason[] = [];
  if (primaryRows.length !== 1) reasons.push(primaryRows.length > 1 ? "duplicate-locus" : "path-unavailable");
  if (options.primaryLock === "live") reasons.push("lock-live");
  if (options.primaryLock === "unknown") reasons.push("lock-unknown");
  if (primary !== undefined) reasons.push(...primaryRowStopReasons(primary));
  if (reasons.length > 0) {
    return { kind: "unsafe", checkoutPath: options.primaryPath, reasons: sortStopReasons(reasons) };
  }
  if (primary?.kind === "managed-role" && primary.recordId !== null) {
    return {
      kind: "occupied",
      checkoutPath: options.primaryPath,
      recordId: primary.recordId,
      leaseState: primary.lease?.state ?? "absent",
    };
  }
  if (primary?.kind === "free-primary") {
    const freeReasons: LocusStopReason[] = [];
    if (!options.primarySafety.clean) freeReasons.push("primary-dirty");
    if (!options.primarySafety.onBase) freeReasons.push("primary-off-base");
    return freeReasons.length === 0
      ? { kind: "free", checkoutPath: options.primaryPath }
      : { kind: "unsafe", checkoutPath: options.primaryPath, reasons: freeReasons };
  }
  return { kind: "unsafe", checkoutPath: options.primaryPath, reasons: ["subject-unresolved"] };
}

function primaryRowStopReasons(row: LocusRowV1): LocusStopReason[] {
  const reasons = row.diagnostics.flatMap((item): LocusStopReason[] => {
    switch (item.code) {
      case "subject-unresolved":
      case "unsupported-version":
      case "duplicate-locus":
      case "marker-missing":
      case "cross-identity":
      case "record-malformed":
      case "path-unavailable":
        return [item.code];
      default:
        return [];
    }
  });
  if (row.kind === "duplicate-locus") reasons.push("duplicate-locus");
  if (row.kind === "malformed-record" && reasons.length === 0) reasons.push("record-malformed");
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

/** Assemble the single public roster/state value from pure derivation inputs. */
export function assembleLocusState(options: {
  primaryPath: string;
  rows: readonly ProvisionalLocusRow[];
  diagnostics: readonly LocusDiagnosticV1[];
  enteringAnchor: LocusAnchor;
  primaryAvailability: LocusStateV1["primaryAvailability"];
  inFlightIdentities: LocusStateV1["inFlightIdentities"];
  recovery: LocusStateV1["recovery"];
  reconciliation: LocusStateV1["reconciliation"];
}): LocusStateV1 {
  const frames = deriveLocusFrames(options);
  return {
    roster: {
      mode: "locus",
      ok: true,
      primaryPath: options.primaryPath,
      rows: [...frames.rows],
      diagnostics: [...options.diagnostics],
    },
    current: frames.current,
    primaryAvailability: options.primaryAvailability,
    inFlightIdentities: [...options.inFlightIdentities],
    recovery: options.recovery,
    reconciliation: options.reconciliation,
  };
}

/** Enrich provisional rows with frames and resolve the entering process's current locus. */
export function deriveLocusFrames(options: {
  rows: readonly ProvisionalLocusRow[];
  enteringAnchor: LocusAnchor;
}): LocusFrameDerivation {
  const frames = new Map<ProvisionalLocusRow, LocusRowV1["frame"]>();
  for (const row of options.rows) frames.set(row, baseFrame(row));

  for (const child of options.rows.filter(isLiveTransient)) {
    const parentPath = child.role?.parentCheckoutPath;
    if (parentPath === null || parentPath === undefined) continue;
    const parents = options.rows.filter((candidate) =>
      isRetainedWorkUnit(candidate) && candidate.checkoutPath === parentPath);
    if (parents.length === 1 && parents[0] !== undefined) frames.set(parents[0], "suspended");
  }

  const current = resolveCurrent(options.rows, options.enteringAnchor);
  return {
    rows: options.rows.map((row) => {
      const { leaseAnchor, ...publicRow } = row;
      void leaseAnchor;
      return { ...publicRow, frame: frames.get(row) ?? null };
    }),
    current,
  };
}

function baseFrame(row: ProvisionalLocusRow): LocusRowV1["frame"] {
  if (row.kind === "identity-only") return "idle";
  if (row.kind !== "managed-role" || row.role === null) return null;
  if (row.role.kind === "work-unit" && (row.lease === null || row.lease.state === "dead")) return "idle";
  if (row.lease === null) return "residue";
  return row.lease.state === "live" ? "active" : "residue";
}

function resolveCurrent(
  rows: readonly ProvisionalLocusRow[],
  enteringAnchor: LocusAnchor,
): LocusStateV1["current"] {
  const matching = rows.filter((row) =>
    row.lease?.state === "live" && sameProcessAnchor(row.leaseAnchor, enteringAnchor));
  const transients = matching.filter((row) => row.role?.kind !== "work-unit");
  if (transients.length > 1) return ambiguous(transients);
  const transient = transients[0];
  if (transient !== undefined) {
    const parentPath = transient.role?.parentCheckoutPath ?? null;
    const parents = parentPath === null
      ? []
      : rows.filter((row) => isRetainedWorkUnit(row) && row.checkoutPath === parentPath);
    if (parentPath !== null && parents.length !== 1) return ambiguous([transient, ...parents]);
    const parent = parents[0] ?? null;
    return resolved(transient, parent, rows);
  }
  const workUnits = matching.filter((row) => row.role?.kind === "work-unit");
  if (workUnits.length > 1) return ambiguous(workUnits);
  const workUnit = workUnits[0];
  return workUnit === undefined ? { kind: "none" } : resolved(workUnit, null, rows);
}

function resolved(
  active: ProvisionalLocusRow,
  parent: ProvisionalLocusRow | null,
  rows: readonly ProvisionalLocusRow[],
): Extract<LocusStateV1["current"], { kind: "resolved" }> {
  const sessionHomePath = active.lease?.sessionHomePath;
  const sessionHome = sessionHomePath === undefined
    ? undefined
    : rows.find((row) => row.checkoutPath === sessionHomePath && row.recordId !== null);
  return {
    kind: "resolved",
    sessionHomeRecordId: sessionHome?.recordId ?? null,
    activeRecordId: active.recordId as string,
    parentRecordId: parent?.recordId ?? null,
  };
}

function ambiguous(rows: readonly ProvisionalLocusRow[]): Extract<LocusStateV1["current"], { kind: "ambiguous" }> {
  return {
    kind: "ambiguous",
    recordIds: rows.flatMap((row) => row.recordId === null ? [] : [row.recordId]).sort(compareUtf8),
    reasons: ["role-conflict"],
  };
}

function isLiveTransient(row: ProvisionalLocusRow): boolean {
  return row.kind === "managed-role" && row.role !== null
    && row.role.kind !== "work-unit" && row.lease?.state === "live";
}

function isRetainedWorkUnit(row: ProvisionalLocusRow): boolean {
  return row.kind === "managed-role"
    && row.role?.kind === "work-unit"
    && row.diagnostics.every((item) => item.code === "lease-dead");
}


function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
