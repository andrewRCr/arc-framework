/** Read an archive opening's path, ownership, and adoption evidence without changing content or admitting a record. */
import { join } from "node:path";
import { lstat, readdir } from "node:fs/promises";
import type { ProjectionIndex, RefusedMark, FileStat } from "./index-schema.js";
import type { RecordReference } from "../identity.js";
import type { Remedy } from "../refusal.js";
import type { ProjectionRootState } from "./process-state.js";
import { ArchiveDestinationBlocked, archiveEditDestinationRefusal, archiveFileChangeMark, archivePermissionMark, readArchiveFile, sameArchiveFile, walkOutsideArchive,
  type ArchiveFileIdentity } from "./archive-file.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { gateRead } from "./read-gate.js";
import { observeProjectionProtection, readProjectionProtection, type ProjectionProtectionInput } from "./protection.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { evidenceHeldProjectionMark, isEvidenceHeldEntry, withheldProjectionMark } from "./materialization-file.js";

/** The entry an opening may mark, or the same repair evidence its owner reports. */
export type ProjectionEditInspection = { readonly kind: "ready"; readonly entry: ProjectionIndex["entries"][string]; readonly identity: ArchiveFileIdentity }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

/**
 * Compose the existing path, protection, and adoption readers, stopping before store admission. What holds whatever the
 * file is answers first: the stored record's rights, the archive boundary, the ignore guard, and a new path's owner and
 * its rights, so no remedy about the file leads to a refusal those would give.
 */
export async function inspectProjectionEditPath(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionEditInspection> {
  if (ARCHIVE_FOLDERS.has(path)) return refuse(folderOperandMark(path));
  const entry = index.entries[path];
  if (entry?.withheld) return refuse(isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark(path, root.checkout)
    : entry.refused ?? withheldProjectionMark(path, { checkout: root.checkout, known: entry.kind === "record" }));
  if (entry?.kind === "record") {
    const denied = await readProjectionProtection(protectionInput(root), entry.reference);
    if (denied !== null) return refuse(denied);
  }
  if (!archived(path)) return refuse(await outsideArchiveMark(root, path, entry?.kind === "record"));
  if (!root.writable(path)) return refuse({ reason: `The projection ignore guard does not permit changing ${path}.`,
    remedy: { text: "Repair the reported projection ignore rules and retry arc edit." } });
  if (entry?.kind === "record") {
    const gate = await readEditFile(root, path, true);
    return gate.kind === "refused" ? gate : { kind: "ready", entry, identity: gate.identity };
  }
  return inspectNewEditPath(root, index, path, entry);
}

async function inspectNewEditPath(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: Extract<ProjectionIndex["entries"][string], { kind: "ownerless" }> | undefined): Promise<ProjectionEditInspection> {
  const located = await locateNewEditPath(root, path);
  if (located !== null) return refuse(located);
  const owner = await newArchiveOwner(root, index, path);
  if (owner.kind === "refused") return owner;
  const gate = await readEditFile(root, path, false);
  if (gate.kind === "refused") return gate;
  const alias = await indexedCaseAlias(root, index, path, gate.identity);
  if (alias !== null) return refuse({ reason: `${path} already addresses the indexed archive file ${alias}.`,
    remedy: { text: `Restore the recorded spelling ${alias}, then retry arc edit.` } });
  return inspectNewArchiveEdit(root, path, owner.reference, gate, entry);
}

function protectionInput(root: ProjectionRootState): ProjectionProtectionInput {
  return { store: root.store, checkout: root.checkout, identity: root.identity, exec: root.ports.exec, verb: root.context.verb };
}

/**
 * A path outside the archive is never opened here: a file in a nested checkout's own archive names that checkout, a
 * deleted projected file its restore, and every other the in-place edit, including one whose folders or file refuse
 * inspection, since answering needs no access to a path arc edit never opens.
 */
async function outsideArchiveMark(root: ProjectionRootState, path: string, stored: boolean): Promise<RefusedMark> {
  const outside = { reason: `${path} is outside this checkout's completed archive.`, remedy: { text: IN_PLACE } };
  const walked = walkOutsideArchive(root.checkout, path);
  if (walked !== null) return walked.kind === "foreign" ? walked.mark : outside;
  if (isExcludedProjectionPath(path)) return sideFileMark(path);
  const gate = await gateRead({ path: join(root.checkout, path), markdown: false }).catch((error: unknown) => {
    if (accessRefused(error)) return null;
    throw error;
  });
  return gate?.kind === "absent" ? { reason: `No file exists at ${path}.`, remedy: absentRemedy(path, stored) } : outside;
}

function accessRefused(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM";
}

/** What a path no record lays is, before its owner is asked: a side file, a path another checkout or a link holds, or a folder. */
async function locateNewEditPath(root: ProjectionRootState, path: string): Promise<RefusedMark | null> {
  if (isExcludedProjectionPath(path)) return sideFileMark(path);
  const destination = archiveEditDestinationRefusal(root.checkout, path);
  if (destination !== null) return destination;
  // The destination walk refused any link above the path, so a folder found here is the operand itself.
  return (await lstat(join(root.checkout, path)).catch(() => null))?.isDirectory() === true ? folderOperandMark(path) : null;
}

/** The owner a new archive path would be adopted into, with that owner's rights, both of which hold whatever the file is. */
async function newArchiveOwner(root: ProjectionRootState, index: ProjectionIndex, path: string):
Promise<{ readonly kind: "reference"; readonly reference: RecordReference } | Extract<ProjectionEditInspection, { kind: "refused" }>> {
  const target = await resolveProjectionAdoptionIntent(root, index, path);
  if (target.kind === "refused") return refuse(target.mark);
  if (target.kind !== "reference") return refuse({ reason: `${path} has no established archive owner.`, remedy: { text: NO_OWNER } });
  const rights = await observeProjectionProtection(protectionInput(root), target.reference);
  return rights.kind === "editable" ? target : refuse(rights.mark);
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

async function inspectNewArchiveEdit(root: ProjectionRootState, path: string, reference: RecordReference,
  gate: { stat: FileStat; identity: ArchiveFileIdentity }, entry: Extract<ProjectionIndex["entries"][string], { kind: "ownerless" }> | undefined):
Promise<ProjectionEditInspection> {
  try {
    const verdict = await inspectProjectionAdoption(root, path, reference, gate.stat);
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
const NO_OWNER = "Place the file in its existing archived work unit or Errand's folder, then retry arc edit.";

/** The checkout's root and the folders holding the archive, which a resolved operand names without a trailing slash. */
const ARCHIVE_FOLDERS: ReadonlySet<string> = new Set(["", ".arc", ".arc/completed"]);

/** A folder operand names no one file to open; one outside the archive is pointed at a file inside it. */
function folderOperandMark(path: string): RefusedMark {
  return { reason: `${path === "" ? "The checkout's root" : path} is a folder; arc edit opens one file.`,
    remedy: { text: `Run arc edit on one file inside ${archived(`${path}/`) ? path : ".arc/completed/"}.` } };
}

function sideFileMark(path: string): RefusedMark {
  return { reason: `${path} is an editor or system side file, not an adoptable projected file.`,
    remedy: { text: "Keep side files outside projected roots, or remove the side file and open the intended document." } };
}

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
  if (isExcludedProjectionPath(path)) return refuse(sideFileMark(path));
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
    if (accessRefused(error)) throw new ArchiveDestinationBlocked({ ...archivePermissionMark(path, error, "list folders for"),
      remedy: { text: "Restore listing access to the archive file's folders, then retry arc edit." } });
    if (!missingFile(error)) throw error;
    return false;
  }
  return true;
}

function missingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
