/** Resolve frozen presentation dependencies without expanding native check-key scope. */
import { SourceManifestEntrySchema, type SourceManifestEntry } from "./contract-source.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";

/** A canonical dependency label and its actual stored entry, or an unresolved scoped read. */
export type SourcePresentationRead = { status: "present"; path: string; entry: SourceManifestEntry }
  | { status: "unavailable"; path: string; reason: string };
/** Lookups only establish present catalog dependencies; callers retain explicit historical absence separately. */
export interface SourcePresentationIndex { read(path: string): SourcePresentationRead }

/** Index captured names for scoped dependency reads; final check-key composition remains with the caller. */
export function indexSourcePresentation(source: Pick<FrozenSourcePresentation, "manifest" | "codePaths">): SourcePresentationIndex {
  const codePaths = new Map(source.codePaths);
  const entries = new Map<string, SourceManifestEntry | undefined>();
  for (const entry of source.manifest.entries) {
    const parsed = SourceManifestEntrySchema.safeParse(entry);
    entries.set(entry.path, entries.has(entry.path) || !parsed.success ? undefined : parsed.data);
  }
  return { read: path => {
    const stored = codePaths.get(path);
    const entry = stored === undefined ? undefined : entries.get(stored);
    return entry === undefined
      ? { status: "unavailable", path, reason: "Source presentation mapping or entry is unavailable" }
      : { status: "present", path, entry: { ...entry } };
  } };
}
