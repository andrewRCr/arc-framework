/** Recover the ownership of a reused projection pathname from its persisted installation evidence. */
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { gateRead, SYSTEM_READ_GATE } from "./read-gate.js";
import { projectionFileReader } from "./change-detection.js";
import { gitBlobId } from "./blob-id.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { ownershipHandoffMark } from "./ownership-hold.js";
import { notAFileHoldMark } from "./replace-guard.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { Remedy } from "../refusal.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { selectArchivePath } from "./archive-selection.js";

/** Lease-bound path authority shared by materialization and command settlement. */
export type OwnershipRoot = Pick<ProjectionRootState, "checkout" | "location" | "context" | "writable" | "blockedByLink"
  | "archiveSelection">;
/** Filesystem authority needed to interpret an arrival, without publishing its confirmation. */
export type OwnershipObservationRoot = Pick<OwnershipRoot, "checkout" | "writable" | "blockedByLink" | "archiveSelection"> & {
  readonly context: Pick<OwnershipRoot["context"], "format" | "report">;
};

/** A path the index binds to a record: its reference, observed bytes, and no arrival in flight. */
function boundAt(entry: ProjectionIndex["entries"][string] | undefined, reference: RecordReference): boolean {
  return entry?.kind === "record" && sameReference(entry.reference, reference) && entry.stat !== null && entry.handoff === undefined;
}

/** Keep every desired identity the index did not already bind before a layout pass. */
export function findProjectionArrivals(index: ProjectionIndex, desired: ReadonlyMap<string, RecordReference>): ReadonlyMap<string, RecordReference> {
  return new Map([...desired].filter(([path, reference]) => !boundAt(index.entries[path], reference)));
}

/**
 * A layout pass acknowledges only arrivals whose bytes have been installed and confirmed, or a file it withheld on that
 * record's basis, which the next pass already reads as bound.
 */
export function projectionArrivalsInstalled(index: ProjectionIndex, arrivals: ReadonlyMap<string, RecordReference>): boolean {
  return [...arrivals].every(([path, reference]) => {
    const entry = index.entries[path];
    return entry?.kind === "record" && sameReference(entry.reference, reference) && entry.handoff === undefined
      && (!entry.pending && !entry.withheld || entry.withheld && boundAt(entry, reference));
  });
}

/** Reconcile journaled arrivals before a command can send authored bytes. */
export async function reconcileProjectionHandoffs(root: OwnershipRoot, initial: ProjectionIndex, selection?: readonly string[]): Promise<ProjectionIndex> {
  const index = await observeProjectionHandoffs(root, initial, selection, true);
  return index === initial ? index : commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index, checkpoint: root.context.checkpoint });
}

/** Interpret current installation evidence in memory; observation failures propagate unless the writer retains a retry. */
export async function observeProjectionHandoffs(root: OwnershipObservationRoot, initial: ProjectionIndex,
  selection?: readonly string[], retainReadFailure = false): Promise<ProjectionIndex> {
  if (selection === undefined) loadProjectionGroups(initial, "walked");
  const paths = (selection ?? Object.keys(initial.entries)).filter(path => {
    const entry = initial.entries[path];
    return entry?.kind === "record" && entry.handoff !== undefined;
  });
  const boundary = await readProjectionLinkBoundary(root.checkout, paths);
  let index = initial;
  for (const path of paths) {
    if (!root.writable(path) || root.blockedByLink(path) !== null || boundary(path) !== null) continue;
    const entry = index.entries[path];
    if (entry?.kind !== "record" || entry.handoff === undefined) continue;
    if (selectArchivePath(root, path) !== null) continue;
    try {
      const next = await reconcilePath(root, path, entry, retainReadFailure);
      if (next !== entry) index = withProjectionEntry(index, path, next);
    } catch (error) {
      if (!(error instanceof ArchiveDestinationBlocked)) throw error;
      root.context.report?.({ path, copy: null, mark: error.mark });
    }
  }
  return index;
}

async function reconcilePath(root: OwnershipObservationRoot, path: string, entry: RecordEntry, retainReadFailure: boolean): Promise<RecordEntry> {
  const arriving = entry.handoff;
  if (arriving === undefined) return entry;
  const absolute = join(root.checkout, path);
  const reader = projectionFileReader(root.checkout, path);
  const gate = await gateRead({ path: absolute, markdown: false }, { ...SYSTEM_READ_GATE, stat: async file => reader.stat(file) });
  if (gate.kind === "absent") {
    const leaving = { ...entry };
    delete leaving.handoff;
    // A marked arrival withdrawn before confirmation parks its mark for the retried installation.
    return { ...leaving, ...arriving.changed ? { arrivingChanged: arriving.reference } : {},
      ...arriving.opened ? { arrivingOpened: arriving.reference } : {}, stat: null, pending: true,
      withheld: false, refused: null };
  }
  // A save still settling, a read that failed, or a stat that moved during the read waits for the next reconciliation.
  if (gate.kind === "pending") return entry;
  if (gate.kind === "no-edit" && gate.deleted === "not-a-file") return notAFileArrival(root, path, entry, gate.remedy);
  if (gate.kind !== "read") return withheldArrival(root, path, entry);
  let bytes: Buffer;
  try { bytes = await reader.read(absolute); }
  catch (error) {
    if (error instanceof ArchiveDestinationBlocked || !retainReadFailure) throw error;
    return entry;
  }
  if (!isDeepStrictEqual(gate.stat, await reader.stat(absolute))) return entry;
  if (gate.stat.ino !== arriving.stat?.ino || gitBlobId(bytes, root.context.format) !== arriving.written) return withheldArrival(root, path, entry);
  // The arrival keeps only its own changed mark; a refresh moving its record here marked the arrival, directly or by the
  // leaving entry's `arrivingChanged` that the installation carried over.
  return { ...arriving, stat: gate.stat, withheld: false, pending: false };
}

/** Something other than a regular file at the path holds the journal pending, with the repair its remedy names. */
function notAFileArrival(root: OwnershipObservationRoot, path: string, entry: RecordEntry, remedy: Remedy): RecordEntry {
  root.context.report?.({ path, copy: null, mark: notAFileHoldMark(remedy) });
  const refused = { reason: "not-a-file", remedy };
  return entry.pending && isDeepStrictEqual(entry.refused, refused) ? entry : { ...entry, pending: true, refused };
}

/** Withhold a journaled arrival whose bytes are ambiguous, under the mark naming both identities. */
function withheldArrival(root: OwnershipObservationRoot, path: string, entry: RecordEntry): RecordEntry {
  const mark = ownershipHandoffMark(entry);
  root.context.report?.({ path, copy: null, mark });
  return entry.pending && entry.withheld && isDeepStrictEqual(entry.refused, mark) ? entry
    : { ...entry, pending: true, withheld: true, refused: mark };
}
