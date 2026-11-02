/** The ignore files a guard pass rests on, recorded in the index, and whether any has changed since by the racy rule. */
import { readFile } from "node:fs/promises";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { checkChange, readStat } from "./change-detection.js";
import type { IgnoreFileRecord } from "./index-schema.js";

/**
 * Record each readable ignore source's own path type/stat and content hash, or its absence. A symlink retains its own
 * stat and hashes its target so replacing a regular worktree ignore file cannot reuse its pass, while supported
 * excludes-file links still detect edits to their targets. Git's guard decides which sources authorize a root.
 * @param paths - The absolute paths the pass returns.
 * @param format - The repository's object format.
 * @returns One record per path, in order.
 */
export async function snapshotIgnoreFiles(paths: readonly string[], format: ObjectFormat): Promise<IgnoreFileRecord[]> {
  return Promise.all(paths.map(async (path): Promise<IgnoreFileRecord> => {
    const stat = await readStat(path);
    const readable = stat?.type === "file" || stat?.type === "symlink" && (await readStat(path, true))?.type === "file";
    if (!readable) return { path, stat: null, blob: null };
    return { path, stat, blob: gitBlobId(await readFile(path), format) };
  }));
}

/**
 * Compare the ignore files recorded at the guard's last pass against each file as it is, by the racy rule with smudging.
 * @param records - The index's records, null where no pass is recorded.
 * @param reference - The index's racy reference, null where missing.
 * @param format - The repository's object format.
 * @returns Whether any may have changed, so the guard runs again before a write into a root.
 */
export async function compareIgnoreFiles(
  records: readonly IgnoreFileRecord[] | null, reference: bigint | null, format: ObjectFormat,
): Promise<"changed" | "unchanged"> {
  if (records === null) return "changed";
  const changed = await Promise.all(records.map((record) => hasChanged(record, reference, format)));
  return changed.includes(true) ? "changed" : "unchanged";
}

async function hasChanged(record: IgnoreFileRecord, reference: bigint | null, format: ObjectFormat): Promise<boolean> {
  if (record.stat === null) return (await readStat(record.path, true))?.type === "file";
  const stat = await readStat(record.path);
  if (stat?.type !== record.stat.type) return true;
  if (stat.type === "symlink") {
    if ((await readStat(record.path, true))?.type !== "file") return true;
    // The link's stat cannot establish that its target is unchanged.
    return gitBlobId(await readFile(record.path), format) !== record.blob;
  }
  const verdict = await checkChange({
    path: record.path, recorded: record.stat, written: record.blob, reference, format,
  });
  return verdict.status === "absent" || verdict.status === "changed";
}
