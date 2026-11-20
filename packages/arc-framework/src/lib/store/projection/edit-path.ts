/** Read an archive opening's path, ownership, and adoption evidence without changing content or admitting a record. */
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { ProjectionIndex, RefusedMark, FileStat } from "./index-schema.js";
import type { Remedy } from "../refusal.js";
import type { ProjectionRootState } from "./process-state.js";
import { archiveEditDestinationRefusal, archiveFileChangeMark, readArchiveFile, sameArchiveFile, type ArchiveFileIdentity } from "./archive-file.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { gateRead } from "./read-gate.js";
import { readProjectionProtection } from "./protection.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { evidenceHeldProjectionMark, isEvidenceHeldEntry, withheldProjectionMark } from "./materialization-file.js";

/** The entry an opening may mark, or the same repair evidence its owner reports. */
export type ProjectionEditInspection = { readonly kind: "ready"; readonly entry: ProjectionIndex["entries"][string]; readonly identity: ArchiveFileIdentity }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

/** Compose the existing path, protection, and adoption readers, stopping before store admission. */
export async function inspectProjectionEditPath(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionEditInspection> {
  const entry = index.entries[path];
  if (entry?.withheld) return refuse(isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark(path, root.checkout)
    : entry.refused ?? withheldProjectionMark(path, { checkout: root.checkout, known: entry.kind === "record" }));
  const gate = await readEditFile(root, path, entry?.kind === "record");
  if (gate.kind === "refused") return gate;
  if (entry?.kind === "record") {
    const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
      exec: root.ports.exec, verb: root.context.verb }, entry.reference);
    if (denied !== null) return refuse(denied);
  }
  if (!archived(path)) return refuse({ reason: `${path} is outside this checkout's completed archive.`, remedy: { text: IN_PLACE } });
  if (!root.writable(path)) return refuse({ reason: `The projection ignore guard does not permit changing ${path}.`,
    remedy: { text: "Repair the reported projection ignore rules and retry arc edit." } });
  if (entry?.kind === "record") return { kind: "ready", entry, identity: gate.identity };
  const alias = await indexedCaseAlias(root, index, path, gate.identity);
  if (alias !== null) return refuse({ reason: `${path} already addresses the indexed archive file ${alias}.`,
    remedy: { text: `Restore the recorded spelling ${alias}, then retry arc edit.` } });
  return inspectNewArchiveEdit(root, index, path, gate, entry);
}

/** A case-only rename can leave the old index key addressing the new name on disk. */
async function indexedCaseAlias(root: ProjectionRootState, index: ProjectionIndex, path: string, identity: ArchiveFileIdentity): Promise<string | null> {
  const folded = path.toLowerCase();
  for (const alias of Object.keys(index.entries)) {
    if (alias === path || alias.toLowerCase() !== folded) continue;
    const file = await readArchiveFile(root, alias);
    if (file.kind === "file" && sameArchiveFile(file.stat, identity) && !await exactPathSpelling(root.checkout, alias)) return alias;
  }
  return null;
}

async function inspectNewArchiveEdit(root: ProjectionRootState, index: ProjectionIndex, path: string,
  gate: { stat: FileStat; identity: ArchiveFileIdentity }, entry: Extract<ProjectionIndex["entries"][string], { kind: "ownerless" }> | undefined):
Promise<ProjectionEditInspection> {
  const target = await resolveProjectionAdoptionIntent(root, index, path);
  if (target.kind === "refused") return refuse(target.mark);
  if (target.kind !== "reference") return refuse({ reason: `${path} has no established archive owner.`,
    remedy: { text: "Place the file in its existing archived work unit or Errand's folder, then retry arc edit." } });
  try {
    const verdict = await inspectProjectionAdoption(root, path, target.reference, gate.stat);
    if (verdict.kind === "refused") return refuse(verdict.mark);
  } catch (error) {
    if (!missingFile(error)) throw error;
    return refuse(archiveFileChangeMark(path));
  }
  return { kind: "ready", entry: { ...entry, kind: "ownerless", stat: gate.stat, opened: true }, identity: gate.identity };
}

function refuse(mark: RefusedMark): Extract<ProjectionEditInspection, { kind: "refused" }> { return { kind: "refused", mark }; }

const ARCHIVE_ONLY = "arc edit opens only files under .arc/completed/.";
const IN_PLACE = `Edit an in-flight file in place; ${ARCHIVE_ONLY}`;

function archived(path: string): boolean { return path.startsWith(".arc/completed/"); }

/** A missing path outside the archive is never opened, so its remedy edits in place rather than retrying arc edit. */
function absentRemedy(path: string, stored: boolean): Remedy {
  const sync = ["arc", "sync"];
  if (!archived(path)) return stored ? { text: `Run arc sync to restore the deleted projected file, then edit it in place; ${ARCHIVE_ONLY}`, argv: sync }
    : { text: IN_PLACE };
  return stored ? { text: "Run arc sync to restore the deleted projected file, then retry arc edit.", argv: sync }
    : { text: "Create the file in its archived owner's folder first, then run arc edit on that file." };
}

async function readEditFile(root: ProjectionRootState, path: string, stored: boolean):
Promise<{ kind: "read"; stat: FileStat; identity: ArchiveFileIdentity } | Extract<ProjectionEditInspection, { kind: "refused" }>> {
  if (isExcludedProjectionPath(path)) return refuse({
    reason: `${path} is an editor or system side file, not an adoptable projected file.`,
    remedy: { text: "Keep side files outside projected roots, or remove the side file and open the intended document." },
  });
  const destination = archiveEditDestinationRefusal(root.checkout, path);
  if (destination !== null) return refuse(destination);
  const absolute = join(root.checkout, path);
  const gate = await gateRead({ path: absolute, markdown: false });
  if (gate.kind === "absent") return refuse({ reason: `No file exists at ${path}.`, remedy: absentRemedy(path, stored) });
  if (gate.kind === "no-edit") return refuse({ reason: `${path} is not a regular file.`,
    remedy: gate.deleted === "not-a-file" ? gate.remedy : { text: "Restore a regular file, then retry arc edit." } });
  if (gate.kind === "pending") return refuse({ reason: `${path} is still being saved (${gate.reason}).`,
    remedy: { text: "Let the editor finish saving, then retry arc edit." } });
  // A recorded path whose file a case-only rename changed is restored to its recorded spelling, not reopened by the new one.
  if (!await exactPathSpelling(root.checkout, path)) return refuse(stored ? {
    reason: `${path} no longer matches its file's on-disk spelling, which a case-only rename changed.`,
    remedy: { text: `Restore the recorded spelling ${path}, then retry arc edit.` },
  } : {
    reason: `${path} does not match the file's on-disk spelling.`,
    remedy: { text: "Use the file's exact on-disk path, including its capitalization, and retry arc edit." },
  });
  const file = await readArchiveFile(root, path);
  if (file.kind === "blocked") return refuse(file.mark);
  if (file.kind === "missing" || file.stat.ino !== gate.stat.ino) return refuse(archiveFileChangeMark(path));
  return { ...gate, identity: { dev: file.stat.dev, ino: file.stat.ino } };
}

/** Match directory entries so aliases cannot create a second index key for the same on-disk name. */
async function exactPathSpelling(checkout: string, path: string): Promise<boolean> {
  let folder = checkout;
  try {
    for (const component of path.split("/")) {
      if (!(await readdir(folder)).includes(component)) return false;
      folder = join(folder, component);
    }
  } catch (error) {
    if (!missingFile(error)) throw error;
    return false;
  }
  return true;
}

function missingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
