/** Ask whether a selected archive path is this checkout's once per command, keeping the answer, or a refusal met at a change. */
import { archiveDestination } from "./archive-file.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { isProjectionEntryUnsettled } from "./index-file.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ArchiveSelection, ProjectionRootState } from "./process-state.js";
import type { WriteBackDiagnostic } from "./write-back.js";
import { parseAsideFile } from "./aside.js";

/** A rebuild left this destination to the next local sweep before another projection pass can lay it. */
export function hasPendingArchiveRecovery(index: ProjectionIndex, path: string): boolean {
  return path.startsWith(".arc/completed/") && (index.archiveRecoveryCopies?.some(copy => parseAsideFile(copy)?.path === path) ?? false);
}

/** Takes a refusal met just before a change, which the command keeps as that path's answer and reports once. */
export type ArchiveChangeRefusal = (refused: WriteBackDiagnostic) => void;

type SelectingRoot = Pick<ProjectionRootState, "checkout" | "archiveSelection" | "archiveDiscoveryHolds"> & {
  readonly context: Pick<ProjectionRootState["context"], "report">;
};

/**
 * The refusal of an archive path this command selects, or null where the path is this checkout's. The first selection
 * asks, and later selections reuse its answer; a refused path is left untouched for the rest of the command, and a
 * link made after the selection is caught where a change asks again just before it changes the path. A refusal is
 * reported once, at the first selection that does not leave its report to its caller. Discovery callers retain native
 * access failures as held scopes, including when they handle structural refusals themselves.
 */
export function selectArchivePath(root: SelectingRoot, path: string, options: { report?: boolean; holdAccess?: boolean } = {}): RefusedMark | null {
  if (!path.startsWith(".arc/completed/")) return null;
  const folderHold = unreadArchiveScope(root, path);
  if (folderHold !== null) return folderHold;
  const answers = root.archiveSelection ??= new Map<string, ArchiveSelection>();
  let answer = answers.get(path);
  if (answer === undefined) {
    const destination = archiveDestination(root.checkout, path);
    answer = { mark: destination?.mark ?? null, reported: false, ...(destination?.cause === "access" ? { access: true } : {}) };
    answers.set(path, answer);
  }
  if (answer.access && answer.mark !== null && options.holdAccess) {
    refuseUnreadArchiveScope(root, path, answer.mark);
    return answer.mark;
  }
  if (answer.mark !== null && !answer.reported && options.report !== false) {
    answer.reported = true;
    root.context.report?.({ path, copy: null, mark: answer.mark });
  }
  return answer.mark;
}

/** Report an unreadable archive subtree once and leave its descendants to a later command. */
export function refuseUnreadArchiveScope(root: SelectingRoot, path: string, mark: RefusedMark): void {
  const holds = root.archiveDiscoveryHolds ??= new Map();
  if (holds.has(path)) return;
  holds.set(path, mark);
  if (root.archiveSelection?.get(path)?.reported) return;
  root.context.report?.({ path, copy: null, mark });
}

/** Find the command's discovery refusal at this path or one of its ancestors. */
export function unreadArchiveScope(root: Pick<SelectingRoot, "archiveDiscoveryHolds">, path: string): RefusedMark | null {
  if (root.archiveDiscoveryHolds === undefined) return null;
  for (const [folder, mark] of root.archiveDiscoveryHolds) if (path === folder || path.startsWith(`${folder}/`)) return mark;
  return null;
}

/** The archive refusal already known at a destination or an unread ancestor. */
export function heldArchivePath(root: Pick<SelectingRoot, "archiveSelection" | "archiveDiscoveryHolds">, path: string): RefusedMark | null {
  return root.archiveSelection?.get(path)?.mark ?? unreadArchiveScope(root, path);
}

/**
 * Keep a refusal met just before a change as the command's answer for that path: later selections leave the path
 * untouched, and the refusal is reported once, here or wherever the command first reported it.
 */
export function refuseArchiveChange(root: SelectingRoot, path: string, mark: RefusedMark, copy: string | null = null): void {
  if (!path.startsWith(".arc/completed/")) {
    root.context.report?.({ path, copy, mark });
    return;
  }
  if (unreadArchiveScope(root, path) !== null) return;
  const answers = root.archiveSelection ??= new Map<string, ArchiveSelection>();
  const answer = answers.get(path);
  if (answer !== undefined && answer.mark !== null && answer.reported) return;
  answers.set(path, { mark, reported: true });
  root.context.report?.({ path, copy, mark });
}

/** A batch's report of a refusal met just before a change, kept as the command's answer for its path. */
export function archiveChangeRefusals(root: SelectingRoot): ArchiveChangeRefusal {
  return ({ path, copy, mark }) => { refuseArchiveChange(root, path, mark, copy); };
}

/** Whether this command refused any of the paths, at its selection or just before a change. */
export function refusesArchivePath(root: Pick<SelectingRoot, "archiveSelection" | "archiveDiscoveryHolds">, paths: Iterable<string>): boolean {
  for (const path of paths) if (heldArchivePath(root, path) !== null) return true;
  return false;
}

/**
 * The removal check's and the persist and release steps' one selection: the walk joined with every opened or unsettled
 * archive entry, so a path the walk cannot see, behind a link or a nested checkout, keeps its work.
 */
export function retirementSelection(index: ProjectionIndex, walked: readonly string[]): string[] {
  const paths = new Set(walked);
  for (const [path, entry] of Object.entries(index.entries)) {
    if (path.startsWith(".arc/completed/") && !isExcludedProjectionPath(path) && isProjectionEntryUnsettled(entry)) paths.add(path);
  }
  return [...paths].sort();
}
