/** Map conflict deltas back to their projected subjects, including conflicts removed from the store. */
import { ConflictRecordSchema } from "../conflict.js";
import type { HistoryEntry } from "../contract.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { RecordEntry } from "./index-schema.js";
import type { ProjectionRefreshPlanInput } from "./refresh-plan.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** Subject references and any missing evidence that prevents advancing the refresh anchor. */
export interface RefreshSubjects { readonly references: readonly RecordReference[]; readonly unresolved: boolean }

/** Prefer the index's marker, notice, or unshown mapping; use the saved payload for a cold removed conflict. */
export async function refreshSubjectReferences(input: ProjectionRefreshPlanInput, changes: readonly HistoryEntry[]): Promise<RefreshSubjects> {
  const references: RecordReference[] = [];
  let unresolved = false;
  for (const change of changes) {
    if (!change.reference.kind.endsWith("/conflict-record")) { references.push(change.reference); continue; }
    const known = Object.values(input.index.entries).filter((entry): entry is RecordEntry => entry.kind === "record"
      && conflictReferences(entry).some(reference => sameReference(reference, change.reference)));
    if (known.length > 0) { references.push(...known.map(entry => entry.reference)); continue; }
    const read = await input.source.read({ reference: change.reference,
      ...(change.content === null && input.index.state !== null ? { asOf: input.index.state } : {}) });
    if (read.status === "refused") {
      input.root.context.report?.({ path: input.root.checkout, copy: null, mark: markStoreRefusal(read.refusal) });
      unresolved = true;
      continue;
    }
    let value: unknown;
    try { value = JSON.parse(read.result.content); } catch { value = null; }
    const parsed = ConflictRecordSchema.safeParse(value);
    if (parsed.success) references.push(parsed.data.record);
    else {
      input.root.context.report?.({ path: input.root.checkout, copy: null, mark: { reason: "The changed conflict record is malformed.",
        remedy: { text: "Repair the stored conflict record, then refresh again." } } });
      unresolved = true;
    }
  }
  return { references, unresolved };
}

function conflictReferences(entry: RecordEntry): readonly RecordReference[] {
  return [...entry.notices, ...entry.unshown, ...(entry.markers?.sets.flatMap(set => set.shows === "stored" ? [set.conflict] : []) ?? [])];
}
