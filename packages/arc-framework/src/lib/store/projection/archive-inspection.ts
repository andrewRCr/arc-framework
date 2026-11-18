/** Observe unopened archive corrections and their repair route without admitting any authored content. */
import { join } from "node:path";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import type { AdoptionObservationRoot } from "./adoption-verdict.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { checkChange, readReference } from "./change-detection.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { isProjectionEntryUnsettled } from "./index-file.js";
import type { FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import { observeProjectionProtection } from "./protection.js";
import { gateRead, type ReadGateVerdict } from "./read-gate.js";

/** Unavailable evidence precedes any semantic refusal over the file. */
export type ArchiveInspection = { readonly kind: "refused" | "unobservable"; readonly mark: RefusedMark } | null;

/** Racy-rule observations a restoration already made, retained without a second discovery pass. */
export interface ArchiveObservation { readonly reference: bigint | null; readonly stat?: FileStat | null }

const forcedArchiveEdit = "An archived file was edited without opening it.";

/** Opened entries and outstanding work may finish, while a retirement refusal cannot authorize its own retry. */
export function canRecoverArchiveEntry(entry: ProjectionIndex["entries"][string] | undefined): boolean {
  return entry !== undefined && (entry.opened === true
    || (isProjectionEntryUnsettled(entry) && entry.refused?.reason !== forcedArchiveEdit));
}

/** Keep the repair identical when observation or capture discovers an unopened archive correction. */
export function unopenedArchiveMark(checkout: string, path: string, known: boolean): RefusedMark {
  return { reason: known ? forcedArchiveEdit : "A new archived file has not been opened.",
    remedy: { text: `Run arc edit ${renderRemedyArgument(path)} then arc save from ${checkout} to retain this correction.` } };
}

/** Share detection and remedy precedence between sync's report and retirement's read and write boundaries. */
export async function inspectArchivedProjectionFile(root: AdoptionObservationRoot, index: ProjectionIndex, path: string,
  observation?: ArchiveObservation): Promise<ArchiveInspection> {
  if (!path.startsWith(".arc/completed/") || isExcludedProjectionPath(path)) return null;
  const entry = index.entries[path];
  if (entry !== undefined && (entry.kind !== "record" || canRecoverArchiveEntry(entry))) return null;
  try {
    const gate = await readArchiveEdit(root, path, entry, observation);
    if (gate === null || gate.kind === "absent" || gate.kind === "no-edit") return null;
    const denied = entry?.kind === "record" ? await archiveProtection(root, entry.reference)
      : await newArchiveRemedy(root, index, path, gate);
    return denied ?? { kind: "refused", mark: unopenedArchiveMark(root.checkout, path, entry !== undefined) };
  } catch (error) {
    return { kind: "unobservable", mark: { reason: `Cannot observe archived file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Repair the reported archive or ownership evidence, then retry from this checkout." } } };
  }
}


async function readArchiveEdit(root: AdoptionObservationRoot, path: string, entry: RecordEntry | undefined,
  observation?: ArchiveObservation): Promise<ReadGateVerdict | null> {
  if (entry !== undefined) {
    const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
      reference: observation === undefined ? await readReference(root.checkout) : observation.reference,
      format: root.context.format, ...(observation?.stat === undefined ? {} : { observed: observation.stat }) });
    if (changed.status !== "changed") return null;
  }
  return gateRead({ path: join(root.checkout, path), markdown: entry !== undefined && path.endsWith(".md") });
}

async function archiveProtection(root: AdoptionObservationRoot,
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
