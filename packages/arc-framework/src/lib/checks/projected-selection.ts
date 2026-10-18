/** One connection point for the projection's editable Markdown selection. */
import type { CheckRequest } from "./request.js";
import type { PathListSelection } from "./path-list.js";

/** The projected Markdown files this checkout may edit, or the part changed since its last save. */
export function readProjectedSelection(_root: string, _options: { changed: boolean }): Promise<PathListSelection> {
  void _root;
  void _options;
  return Promise.resolve({ status: "ok", paths: [] });
}

/** Selection acquisition shared by check execution and Markdown tooling. */
export type ProjectedSelectionReader = typeof readProjectedSelection;

/** Acquire one request-wide scope, retaining provider refusals and thrown read failures. */
export async function requestProjectedSelection(reader: ProjectedSelectionReader, root: string,
  request: CheckRequest): Promise<PathListSelection> {
  const scope = request.scope;
  const changed = request.form.kind !== "run" || (scope !== undefined && scope.kind !== "all" && scope.kind !== "paths");
  try {
    return await reader(root, { changed });
  } catch (error) {
    return { status: "unavailable", reason: String(error) };
  }
}
