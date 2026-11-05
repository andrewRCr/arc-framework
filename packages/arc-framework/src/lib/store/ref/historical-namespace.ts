/** Establish namespace emptiness independently of a requested record's historical projection. */
import { holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { readRefMetadata } from "./metadata.js";

/** Captured namespace facts; each caller retains its own refusal and retry policy. */
export interface HistoricalNamespaceEvidence {
  recordFree: Set<string>; corrupt: Set<string>; unavailable: Set<string>; missing: Set<string>;
}

/** Read complete entry names only where unusable metadata makes a projected absence ambiguous. */
export async function captureHistoricalNamespaces(context: RefBackendContext, home: StoredRecordHome,
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, objects: ReadonlyMap<string, BatchObject | null>,
  complete: boolean): Promise<HistoricalNamespaceEvidence> {
  const evidence: HistoricalNamespaceEvidence = { recordFree: new Set(), corrupt: new Set(), unavailable: new Set(), missing: new Set() };
  const ambiguous = new Map<string, string>();
  for (const [revision, entries] of trees) {
    const entry = entries.find(({ path }) => path === home.metadataPath);
    const read = readRefMetadata(home.ref, entry, objects);
    if (read.kind === "parsed") continue;
    if (read.kind === "missing") evidence.missing.add(revision);
    if (!holdsNoRecord(home, entries.map(({ path }) => path))) {
      if (read.kind !== "missing") evidence.corrupt.add(revision);
    }
    else if (complete) evidence.recordFree.add(revision);
    else ambiguous.set(revision, revision);
  }
  await captureAmbiguousNamespaces(context, home, ambiguous, evidence);
  return evidence;
}

async function captureAmbiguousNamespaces(context: RefBackendContext, home: StoredRecordHome,
  ambiguous: ReadonlyMap<string, string>, evidence: HistoricalNamespaceEvidence): Promise<void> {
  const full = ambiguous.size ? await readRefTrees(context, ambiguous) : new Map<string, RefTreeEntry[]>();
  for (const revision of ambiguous.keys()) {
    const entries = full.get(revision);
    if (!entries) evidence.unavailable.add(revision);
    else if (holdsNoRecord(home, entries.map(({ path }) => path))) evidence.recordFree.add(revision);
    else if (!evidence.missing.has(revision)) evidence.corrupt.add(revision);
  }
}
