/** Choose the accepted or installed baseline for both local read-back and peer replacement. */
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { projectionFileReader } from "./change-detection.js";
import type { RecordEntry } from "./index-schema.js";
import { archiveAdoptionBasis, archiveLayPhase, awaitsArchiveInstallation } from "./recording-state.js";
import type { ReplaceGuardInput } from "./replace-guard.js";

/** Interpret first-lay evidence against the record this replacement would actually install. */
export async function readArchiveAdoptionBaseline(checkout: string, path: string, entry: RecordEntry, record: StoreRecord,
  format: ObjectFormat): Promise<ReplaceGuardInput["baseline"]> {
  if (entry.adoption?.kind !== "read-back" || entry.opened !== true || !path.startsWith(".arc/completed/")) return undefined;
  const original = entry.adoption.read;
  const phase = archiveLayPhase(entry);
  const rendered = { stat: entry.stat, blob: entry.written };
  if (phase === "installed") return rendered;
  if (awaitsArchiveInstallation(entry)) {
    const observed = await projectionFileReader(checkout, path).stat(join(checkout, path));
    const basis = archiveAdoptionBasis(entry, original.stat, observed);
    if (basis === "original") return original;
    if (basis === "indeterminate" && path.endsWith(".md") && agreesWithAcceptedInput(entry, record, format)) return original;
    return rendered;
  }
  if (phase === "pending" || entry.inProgress === null || entry.stat === null) return original;
  const observed = await projectionFileReader(checkout, path).stat(join(checkout, path));
  return observed?.ino === original.stat.ino && observed.mtimeNs === original.stat.mtimeNs ? original : rendered;
}

function agreesWithAcceptedInput(entry: RecordEntry, record: StoreRecord, format: ObjectFormat): boolean {
  if (record.conflicts.length > 0 || entry.persisted === null) return false;
  const { inputBlob, takenIn } = entry.persisted;
  const current = gitBlobId(record.content, format);
  return current === inputBlob || (takenIn.kind === "copy" ? current === takenIn.blob : record.version === takenIn.version);
}
