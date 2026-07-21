/** Pure frame and current-locus derivation over provisional roster rows. */

import type { ProvisionalLocusRow } from "./roster.js";
import type {
  LocusAnchor,
  LocusDiagnosticV1,
  LocusRowV1,
  LocusStateV1,
} from "./schema/index.js";

export interface LocusFrameDerivation {
  readonly rows: readonly LocusRowV1[];
  readonly current: LocusStateV1["current"];
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
      isLiveWorkUnit(candidate) && candidate.checkoutPath === parentPath);
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
  if (row.lease === null) return row.role.kind === "work-unit" ? "idle" : "residue";
  return row.lease.state === "live" ? "active" : "residue";
}

function resolveCurrent(
  rows: readonly ProvisionalLocusRow[],
  enteringAnchor: LocusAnchor,
): LocusStateV1["current"] {
  const matching = rows.filter((row) =>
    row.lease?.state === "live" && anchorsEqual(row.leaseAnchor, enteringAnchor));
  const transients = matching.filter((row) => row.role?.kind !== "work-unit");
  if (transients.length > 1) return ambiguous(transients);
  const transient = transients[0];
  if (transient !== undefined) {
    const parentPath = transient.role?.parentCheckoutPath ?? null;
    const parents = parentPath === null
      ? []
      : rows.filter((row) => isLiveWorkUnit(row) && row.checkoutPath === parentPath);
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

function isLiveWorkUnit(row: ProvisionalLocusRow): boolean {
  return row.kind === "managed-role" && row.role?.kind === "work-unit" && row.lease?.state === "live";
}

function anchorsEqual(left: LocusAnchor | null, right: LocusAnchor): boolean {
  if (left?.kind !== "process" || right.kind !== "process") return false;
  return left.pid === right.pid
    && left.startToken === right.startToken
    && left.inspector === right.inspector
    && left.selector === right.selector;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
