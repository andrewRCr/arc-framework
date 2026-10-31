/** The ignore files a guard pass rests on, recorded in the index, and whether any has changed since by the racy rule. */
import { readFile } from "node:fs/promises";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { checkChange, readStat } from "./change-detection.js";
import type { IgnoreFileRecord } from "./index-schema.js";

/**
 * Record each ignore file a guard pass rests on: its stat and blob id, or that it is absent. A symbolic link is followed,
 * as Git reads an ignore file through one, and anything but a file reads as absent.
 * @param paths - The absolute paths the pass returns.
 * @param format - The repository's object format.
 * @returns One record per path, in order.
 */
export async function snapshotIgnoreFiles(paths: readonly string[], format: ObjectFormat): Promise<IgnoreFileRecord[]> {
  return Promise.all(paths.map(async (path): Promise<IgnoreFileRecord> => {
    const stat = await readStat(path, true);
    if (stat?.type !== "file") return { path, stat: null, blob: null };
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
  const verdict = await checkChange({
    path: record.path, recorded: record.stat, written: record.blob, reference, format, followLinks: true,
  });
  return verdict.status === "absent" || verdict.status === "changed";
}
