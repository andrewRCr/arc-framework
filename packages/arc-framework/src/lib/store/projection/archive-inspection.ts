/** Observe unopened archive corrections and their repair route without admitting any authored content. */
import { join } from "node:path";
import type { AdoptionObservationRoot } from "./adoption-verdict.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { checkChange, projectionFileReader, readReference } from "./change-detection.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import type { FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import { observeProjectionProtection } from "./protection.js";
import { gateRead, projectionReadGate, type ReadGateVerdict } from "./read-gate.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { hasAcceptedLanding, waitingEditMark } from "./archive-admission.js";
import { isUnreadRebuildEntry, unreadRebuildHold } from "./materialization-file.js";

/** Unavailable evidence precedes any semantic refusal over the file. */
export type ArchiveInspection = { readonly kind: "refused" | "unobservable"; readonly mark: RefusedMark; readonly access?: boolean } | null;

/** Racy-rule observations a restoration already made, retained without a second discovery pass. */
export interface ArchiveObservation { readonly reference: bigint | null; readonly stat?: FileStat | null }

/** An opened entry's edit, and a landing the store already accepted, finish; any other edit waits for an opening. */
export function canRecoverArchiveEntry(entry: ProjectionIndex["entries"][string] | undefined): boolean {
  return entry !== undefined && (entry.opened === true || hasAcceptedLanding(entry));
}

/** Share detection and remedy precedence between sync's report and retirement's read and write boundaries. */
export async function inspectArchivedProjectionFile(root: AdoptionObservationRoot, index: ProjectionIndex, path: string,
  observation?: ArchiveObservation): Promise<ArchiveInspection> {
  if (!path.startsWith(".arc/completed/") || isExcludedProjectionPath(path)) return null;
  const entry = index.entries[path];
  if (entry?.archiveSubmission !== undefined) return { kind: "refused", mark: {
    reason: "The interrupted archive submission's acceptance has not been checked.",
    remedy: { text: `Run arc save from ${root.checkout} to recover the acceptance for ${path}.` },
  } };
  // An entry a rebuild has not read has no basis to judge an edit against until a lay rebuilds it from the file.
  if (entry?.refused != null && isUnreadRebuildEntry(entry)) return { kind: "refused", mark: unreadRebuildHold(root.checkout, path, entry.refused) };
  // A withheld file keeps its own remedy: arc save never sends one, so the waiting edit's remedy cannot clear it.
  if (entry !== undefined && (entry.kind !== "record" || entry.withheld || canRecoverArchiveEntry(entry))) return null;
  try {
    const gate = await readArchiveEdit(root, path, entry, observation);
    if (gate === null || gate.kind === "absent" || gate.kind === "no-edit") return null;
    const denied = entry?.kind === "record" ? await archiveProtection(root, entry.reference)
      : await newArchiveRemedy(root, index, path, gate);
    return denied ?? { kind: "refused", mark: waitingEditMark(root.checkout, path, entry !== undefined) };
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "unobservable", mark: error.mark, access: error.access };
    return { kind: "unobservable", mark: { reason: `Cannot observe archived file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Repair the reported archive or ownership evidence, then retry from this checkout." } } };
  }
}


async function readArchiveEdit(root: AdoptionObservationRoot, path: string, entry: RecordEntry | undefined,
  observation?: ArchiveObservation): Promise<ReadGateVerdict | null> {
  const absolute = join(root.checkout, path);
  const reader = projectionFileReader(root.checkout, path);
  if (entry !== undefined) {
    const changed = await checkChange({ path: absolute, recorded: entry.stat, written: entry.written,
      reference: observation === undefined ? await readReference(root.checkout) : observation.reference,
      format: root.context.format, observed: observation?.stat }, reader.read, reader.stat);
    if (changed.status !== "changed") return null;
  }
  return gateRead({ path: absolute, markdown: entry !== undefined && path.endsWith(".md") }, projectionReadGate(root.checkout, path));
}

/** Observe current rights for a known archived record before telling the caller how to correct it. */
export async function archiveProtection(root: AdoptionObservationRoot,
  reference: Parameters<typeof observeProjectionProtection>[1]): Promise<ArchiveInspection> {
  const rights = await observeProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, reference);
  return rights.kind === "editable" ? null : { kind: rights.kind === "unobservable" ? "unobservable" : "refused", mark: rights.mark };
}

async function newArchiveRemedy(root: AdoptionObservationRoot, index: ProjectionIndex, path: string,
  gate: Extract<ReadGateVerdict, { kind: "read" | "pending" }>): Promise<ArchiveInspection> {
  const target = await resolveProjectionAdoptionIntent(root, index, path);
  if (target.kind === "refused") return { kind: target.readFailure ? "unobservable" : "refused", mark: target.mark };
  if (target.kind !== "reference") return { kind: "refused", mark: { reason: `No established archive owner for ${path}.`,
    remedy: { text: "Place the file in its existing archived work unit or Errand's folder, then retry arc edit." } } };
  if (gate.kind === "pending") return archiveProtection(root, target.reference);
  const verdict = await inspectProjectionAdoption(root, path, target.reference, gate.stat);
  return verdict.kind === "refused" ? { kind: verdict.readFailure ? "unobservable" : "refused", mark: verdict.mark } : null;
}
