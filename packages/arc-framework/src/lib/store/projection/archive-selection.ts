/** Ask whether a selected archive path is this checkout's once per command, reusing the answer at later selections. */
import { archiveDestinationRefusal } from "./archive-file.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { isProjectionEntryUnsettled } from "./index-file.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ArchiveSelection, ProjectionRootState } from "./process-state.js";

type SelectingRoot = { readonly checkout: string; archiveSelection?: Map<string, ArchiveSelection> } & {
  readonly context: Pick<ProjectionRootState["context"], "report">;
};

/**
 * The refusal of an archive path this command selects, or null where the path is this checkout's. The first selection
 * asks, and later selections reuse its answer; a refused path is left untouched for the rest of the command, and a
 * link made after the selection is caught where a change asks again just before it changes the path. A refusal is
 * reported once, at the first selection that does not leave its report to its caller.
 */
export function selectArchivePath(root: SelectingRoot, path: string, options: { report?: boolean } = {}): RefusedMark | null {
  if (!path.startsWith(".arc/completed/")) return null;
  const answers = root.archiveSelection ??= new Map<string, ArchiveSelection>();
  let answer = answers.get(path);
  if (answer === undefined) {
    answer = { mark: archiveDestinationRefusal(root.checkout, path), reported: false };
    answers.set(path, answer);
  }
  if (answer.mark !== null && !answer.reported && options.report !== false) {
    answer.reported = true;
    root.context.report?.({ path, copy: null, mark: answer.mark });
  }
  return answer.mark;
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
