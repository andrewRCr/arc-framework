/** Recover the ownership of a reused projection pathname from its persisted installation evidence. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { gateRead } from "./read-gate.js";
import { readStat } from "./change-detection.js";
import { gitBlobId } from "./blob-id.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { loadProjectionGroups, withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { ownershipHandoffMark } from "./ownership-hold.js";
import { sameReference, type RecordReference } from "../identity.js";

/** Lease-bound path authority shared by materialization and command settlement. */
export type OwnershipRoot = Pick<ProjectionRootState, "checkout" | "location" | "context" | "writable" | "blockedByLink">;
/** Filesystem authority needed to interpret an arrival, without publishing its confirmation. */
export type OwnershipObservationRoot = Pick<OwnershipRoot, "checkout" | "writable" | "blockedByLink"> & {
  readonly context: Pick<OwnershipRoot["context"], "format" | "report">;
};

/** Keep every desired identity the index did not already bind before a layout pass. */
export function findProjectionArrivals(index: ProjectionIndex, desired: ReadonlyMap<string, RecordReference>): ReadonlyMap<string, RecordReference> {
  return new Map([...desired].filter(([path, reference]) => {
    const entry = index.entries[path];
    return entry?.kind !== "record" || !sameReference(entry.reference, reference) || entry.stat === null || entry.handoff !== undefined;
  }));
}

/** A layout pass acknowledges only arrivals whose bytes have been installed and confirmed. */
export function projectionArrivalsInstalled(index: ProjectionIndex, arrivals: ReadonlyMap<string, RecordReference>): boolean {
  return [...arrivals].every(([path, reference]) => {
    const entry = index.entries[path];
    return entry?.kind === "record" && sameReference(entry.reference, reference) && !entry.pending && !entry.withheld && entry.handoff === undefined;
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
    const next = await reconcilePath(root, path, entry, retainReadFailure);
    if (next !== entry) index = withProjectionEntry(index, path, next);
  }
  return index;
}

async function reconcilePath(root: OwnershipObservationRoot, path: string, entry: RecordEntry, retainReadFailure: boolean): Promise<RecordEntry> {
  const arriving = entry.handoff;
  if (arriving === undefined) return entry;
  const absolute = join(root.checkout, path);
  const gate = await gateRead({ path: absolute, markdown: false });
  if (gate.kind === "absent") {
    const leaving = { ...entry };
    delete leaving.handoff;
    return { ...leaving, stat: null, pending: true, withheld: false, refused: null };
  }
  if (gate.kind !== "read") return heldArrival(root, path, entry);
  const bytes = await readFile(absolute).catch((error: unknown) => {
    if (!retainReadFailure) throw error;
    return null;
  });
  if (bytes === null || !isDeepStrictEqual(gate.stat, await readStat(absolute))) return heldArrival(root, path, entry);
  if (gate.stat.ino !== arriving.stat?.ino || gitBlobId(bytes, root.context.format) !== arriving.written) return heldArrival(root, path, entry);
  return { ...arriving, stat: gate.stat, withheld: false, pending: false };
}

function heldArrival(root: OwnershipObservationRoot, path: string, entry: RecordEntry): RecordEntry {
  const mark = ownershipHandoffMark(entry);
  root.context.report?.({ path, copy: null, mark });
  return entry.pending && entry.withheld && isDeepStrictEqual(entry.refused, mark) ? entry
    : { ...entry, pending: true, withheld: true, refused: mark };
}
