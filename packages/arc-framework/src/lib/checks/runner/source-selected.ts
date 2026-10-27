/** Check selected Git entry kinds against their frozen caller-side presentation. */
import type { SourceBoundaryIO } from "./source-boundary.js";
import { SourceEntryPathSchema, type SourceManifestEntry } from "./contract-source.js";
import { SourceCaptureError } from "./source-error.js";
import { decodeSourceText } from "./source-paths.js";
import { decodeSourceLinkTarget } from "./source-link-target.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";
import { indexSourcePresentation } from "./source-scope.js";

function selectedEntries(bytes: Uint8Array): { mode: string; oid: string; path: string }[] {
  if (bytes.length === 0) return [];
  const records = decodeSourceText(bytes).split("\0");
  if (records.pop() !== "") throw new SourceCaptureError("Selected source tree listing is incomplete");
  return records.map(record => {
    const match = /^(100644|100755|120000) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/u.exec(record);
    const [, mode, oid, path] = match ?? [];
    if (mode === undefined || oid === undefined || path === undefined || !SourceEntryPathSchema.safeParse(path).success) {
      throw new SourceCaptureError("Selected source contains an unsupported entry kind, mode or path");
    }
    return { mode, oid, path };
  });
}

function verifyKind(mode: string, entry: SourceManifestEntry): void {
  if (mode === "120000") {
    if (entry.kind !== "symlink") throw new SourceCaptureError("Selected source link cannot be preserved as a literal link");
  } else if (entry.kind !== "file" || (entry.mode & 0o111) !== (mode === "100755" ? 0o111 : 0)) {
    throw new SourceCaptureError("Selected source file kind or executable mode cannot be preserved");
  }
}

/** Refuse flattened links, lost executable modes or other changes to the selected entry kind. */
export async function verifySelectedSourcePresentation(io: SourceBoundaryIO, root: string,
  source: Pick<FrozenSourcePresentation, "manifest" | "codePaths">): Promise<void> {
  const options = { cwd: root, objectAccess: "local-only" as const };
  const listing = await io.gitRaw(["ls-tree", "-r", "-z", "--full-tree", source.manifest.coordinates.tree], options);
  const index = indexSourcePresentation(source);
  for (const selected of selectedEntries(listing.stdout)) {
    const read = index.read(selected.path);
    if (read.status !== "present") throw new SourceCaptureError("Selected source entry presentation is unavailable");
    verifyKind(selected.mode, read.entry);
    if (read.entry.kind === "symlink") {
      const target = await io.gitRaw(["cat-file", "blob", selected.oid], options);
      if (read.entry.target !== decodeSourceLinkTarget(target.stdout)) throw new SourceCaptureError("Selected source link target cannot be preserved");
    }
  }
}
