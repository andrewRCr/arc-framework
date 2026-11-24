/** Read an archive opening's path, ownership, and adoption evidence without changing content or admitting a record. */
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RecordReference } from "../identity.js";
import type { ProjectionIndex, RefusedMark, FileStat, RecordEntry } from "./index-schema.js";
import { loadProjectionPathGroup } from "./index-memory.js";
import type { ProjectionRootState } from "./process-state.js";
import { readProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { gateRead } from "./read-gate.js";
import { readProjectionProtection, type ProjectionProtectionInput } from "./protection.js";
import { resolveProjectionAdoptionIntent } from "./adoption-intent.js";
import { inspectProjectionAdoption } from "./adoption-verdict.js";
import { evidenceHeldProjectionMark, isEvidenceHeldEntry, withheldProjectionMark } from "./materialization-file.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** The entry an opening may mark, or the same repair evidence its owner reports. */
export type ProjectionEditInspection = { readonly kind: "ready"; readonly entry: ProjectionIndex["entries"][string] }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

type OwnerlessEntry = Extract<ProjectionIndex["entries"][string], { kind: "ownerless" }>;
type ArchiveEditTarget = { readonly kind: "record"; readonly entry: RecordEntry }
  | { readonly kind: "reference"; readonly reference: RecordReference; readonly entry: OwnerlessEntry | undefined };
type EditTarget = ArchiveEditTarget
  | { readonly kind: "outside" }
  | Extract<ProjectionEditInspection, { kind: "refused" }>;

const ARCHIVE_PREFIX = ".arc/completed/";
const ARCHIVE_ONLY = `arc edit opens only files under ${ARCHIVE_PREFIX}.`;
const IN_PLACE = `Edit an in-flight file in place; ${ARCHIVE_ONLY}`;

/** Compose the existing path, protection, and adoption readers, stopping before store admission. */
export async function inspectProjectionEditPath(root: ProjectionRootState, index: ProjectionIndex, path: string): Promise<ProjectionEditInspection> {
  const entry = index.entries[path];
  const target = await editTarget(root, index, path, entry);
  const spelling = entry === undefined ? await indexedCaseAlias(root.checkout, index, path) : null;
  if (spelling !== null) return refuse({ reason: `${path} addresses the archived file stored as ${spelling}.`,
    remedy: { text: `Use the stored spelling ${spelling} and retry arc edit.` } });
  if (target.kind === "outside" || target.kind === "refused") {
    return refuse(await describeUnavailableOperand(root.checkout, path, target, entry?.kind === "record"));
  }
  const gate = await readEditFile(root, path);
  if (gate.kind === "refused") return gate;
  if (gate.kind === "absent") return refuse(await missingArchiveOperandMark(root, path, target));
  if (target.kind === "record") return { kind: "ready", entry: target.entry };
  try {
    const verdict = await inspectProjectionAdoption(root, path, target.reference, gate.stat);
    if (verdict.kind === "refused") return refuse(verdict.mark);
  } catch (error) {
    if (!missingFile(error)) throw error;
    return refuse(await missingArchiveOperandMark(root, path, target));
  }
  return { kind: "ready", entry: { ...target.entry, kind: "ownerless", stat: gate.stat, opened: true } };
}

async function editTarget(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: ProjectionIndex["entries"][string] | undefined): Promise<EditTarget> {
  if (entry?.withheld) return refuse(isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark(path) : entry.refused ?? withheldProjectionMark(path));
  const protection: ProjectionProtectionInput = { store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb };
  if (entry?.kind === "record") {
    const denied = await readProjectionProtection(protection, entry.reference);
    if (denied !== null) return refuse(denied);
  }
  if (!path.startsWith(ARCHIVE_PREFIX)) return { kind: "outside" };
  if (isExcludedProjectionPath(path)) return refuse({
    reason: `${path} is an editor or system side file, not an adoptable projected file.`,
    remedy: { text: "Keep side files outside projected roots, or remove the side file and open the intended document." },
  });
  if (!root.writable(path)) return refuse({ reason: `The projection ignore guard does not permit changing ${path}.`,
    remedy: { text: "Repair the reported projection ignore rules and retry arc edit." } });
  if (entry?.kind === "record") return { kind: "record", entry };
  const target = await resolveProjectionAdoptionIntent(root, index, path);
  if (target.kind === "refused") return refuse(target.mark);
  if (target.kind !== "reference") return refuse({ reason: `${path} has no established archive owner.`,
    remedy: { text: "Place the file in its existing archived work unit or Errand's folder, then retry arc edit." } });
  const denied = await readProjectionProtection(protection, target.reference);
  return denied === null ? { ...target, entry } : refuse(denied);
}

/** Use directory names to distinguish a case alias from a separately spelled file. */
async function indexedCaseAlias(checkout: string, index: ProjectionIndex, path: string): Promise<string | null> {
  const folded = path.toLowerCase();
  if (!folded.startsWith(ARCHIVE_PREFIX)) return null;
  loadProjectionPathGroup(index.entries, folded);
  const stored = Object.keys(index.entries).find(candidate => candidate.toLowerCase() === folded);
  if (stored === undefined) return null;
  try {
    const [requested, recorded] = await Promise.all([lstat(join(checkout, path)), lstat(join(checkout, stored))]);
    if (!requested.isFile() || !recorded.isFile()) return null;
    const parts = path.split("/"), storedParts = stored.split("/");
    for (const [i, part] of parts.entries()) {
      const storedPart = storedParts[i];
      if (storedPart === undefined || part === storedPart) continue;
      const names = await readdir(join(checkout, ...parts.slice(0, i)));
      if (names.includes(part) && names.includes(storedPart)) return null;
    }
    return stored;
  } catch (error) {
    if (missingFile(error) || accessDenied(error)) return null;
    throw error;
  }
}

async function describeUnavailableOperand(checkout: string, path: string,
  target: Extract<EditTarget, { kind: "outside" | "refused" }>, stored: boolean): Promise<RefusedMark> {
  try {
    if ((await lstat(join(checkout, path))).isDirectory()) return folderOperandMark(path);
  } catch (error) {
    if (missingFile(error) && target.kind === "outside") return missingOperandMark(path, stored);
    if (!missingFile(error) && !accessDenied(error)) throw error;
  }
  return target.kind === "refused" ? target.mark : { reason: `${path} is outside this checkout's completed archive.`,
    remedy: { text: IN_PLACE } };
}

function folderOperandMark(path: string): RefusedMark {
  return { reason: `${path === "" ? "The checkout's root" : path} is a folder. The arc edit command opens one file.`,
    remedy: { text: `Run arc edit on one file inside ${path.startsWith(ARCHIVE_PREFIX) ? path : ARCHIVE_PREFIX}.` } };
}

function missingOperandMark(path: string, stored: boolean): RefusedMark {
  const archived = path.startsWith(ARCHIVE_PREFIX);
  const reason = `No file exists at ${path}.`;
  if (stored) return { reason, remedy: { argv: ["arc", "sync"], text: "Run arc sync to restore the deleted projected file, "
    + (archived ? "then retry arc edit." : "then edit it in place.") } };
  return { reason, remedy: { text: archived ? "Create the file in its archived owner's folder first, then run arc edit on that file." : IN_PLACE } };
}

async function missingArchiveOperandMark(root: ProjectionRootState, path: string, target: ArchiveEditTarget): Promise<RefusedMark> {
  if (target.kind === "record") return missingOperandMark(path, true);
  const read = await root.store.read({ reference: target.reference });
  if (read.status === "ok") return missingOperandMark(path, true);
  return read.refusal.code === "not-found" ? missingOperandMark(path, false) : markStoreRefusal(read.refusal, root.context.verb);
}

function missingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function accessDenied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM";
}

function refuse(mark: RefusedMark): Extract<ProjectionEditInspection, { kind: "refused" }> { return { kind: "refused", mark }; }

async function readEditFile(root: ProjectionRootState, path: string):
Promise<{ kind: "read"; stat: FileStat } | { kind: "absent" } | Extract<ProjectionEditInspection, { kind: "refused" }>> {
  const absolute = join(root.checkout, path);
  const linked = (await readProjectionLinkBoundary(root.checkout, [path]))(path);
  if (linked !== null) return refuse({ reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(linked) });
  const gate = await gateRead({ path: absolute, markdown: false });
  if (gate.kind === "no-edit") {
    const observed = await lstat(absolute).catch((error: unknown) => {
      if (missingFile(error)) return null;
      throw error;
    });
    if (observed === null) return { kind: "absent" };
    if (observed.isDirectory()) return refuse(folderOperandMark(path));
    return refuse({ reason: `${path} is not a regular file.`,
      remedy: gate.deleted === "not-a-file" ? gate.remedy : { text: "Restore a regular file, then retry arc edit." } });
  }
  if (gate.kind === "pending") return refuse({ reason: `${path} is still being saved (${gate.reason}).`,
    remedy: { text: "Let the editor finish saving, then retry arc edit." } });
  return gate;
}
