/** Select editable projected Markdown from the command's completed start and index. */
import type { Store } from "../contract.js";
import type { RecordEntry } from "./index-schema.js";
import { isProjectedPath } from "../../layout/index.js";
import { projectionProcessState } from "./process-state.js";
import { readProjectionIndex } from "./index-file.js";
import { projectionStartRefusal, type ProjectionStartRefusal } from "./start-refusal.js";

/** The indexed facts that decide selection; no stored content is needed. */
export type SelectionEntry = Pick<RecordEntry, "kind" | "protected" | "markers" | "changed" | "withheld"> | { readonly kind: "ownerless" };
/** Selected repository-relative paths or a repairable start/index refusal. */
export type ProjectionSelectionResult =
  | { readonly status: "ok"; readonly result: { readonly paths: readonly string[] } }
  | { readonly status: "refused"; readonly refusal: ProjectionStartRefusal };

/** Filter only the indexed facts that determine whether Markdown can be checked. */
export function selectProjectedMarkdown(entries: Readonly<Record<string, SelectionEntry>>, options: { changed?: boolean } = {}): readonly string[] {
  return Object.entries(entries).filter(([path, entry]) => {
    if (entry.kind !== "record" || entry.withheld || entry.protected || entry.markers !== null || (options.changed && !entry.changed)) return false;
    if (!path.endsWith(".md") || !isProjectedPath(path) || path.startsWith(".arc/completed/")) return false;
    const parts = path.split("/");
    return !(parts[1] === "user" && (parts[3] === ".internal" || parts[3] === "scratch"));
  }).map(([path]) => path);
}

/** Read the selection after the matching checkout's command start. */
export async function projectionSelectionResult(store: Store, checkout: string,
  options: { changed?: boolean } = {}): Promise<ProjectionSelectionResult> {
  const state = projectionProcessState();
  if (state.command?.checkout === checkout && state.skip?.reason === "switch") {
    return { status: "refused", refusal: { code: "projection-skipped", condition: state.skip.mark.reason, remedy: state.skip.mark.remedy } };
  }
  if (!store.capabilities.stateOffBranch) return { status: "ok", result: { paths: [] } };
  const refusal = projectionStartRefusal("arc selection", checkout);
  if (refusal !== null) return { status: "refused", refusal };
  if (state.start?.kind === "no-projection") return { status: "ok", result: { paths: [] } };
  const root = state.roots.get(checkout);
  if (root?.ready !== true) return { status: "refused", refusal: { code: "projection-not-started",
    condition: "The checkout's projection start has not completed.", remedy: { text: "Retry arc selection through its command entry." } } };
  const disk = await readProjectionIndex(root.location, true, { groups: "non-completed", retry: true });
  if (disk.kind !== "index") return { status: "refused", refusal: { code: "projection-refused",
    condition: `Projection index is ${disk.kind === "unusable" ? disk.cause : "missing"}.`,
    remedy: { text: "Restore a readable projection index, then retry arc selection; existing projected files have been preserved." } } };
  return { status: "ok", result: { paths: selectProjectedMarkdown(disk.index.entries, options)
    .filter(path => root.blockedByLink(path) === null) } };
}
