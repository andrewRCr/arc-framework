/** Merge an edit from retained take-in content that the store never held as a version. */
import { mergeEntryText } from "../concurrency/entry-merge.js";
import { mergeLineText } from "../concurrency/line-merge.js";
import { stampEntryIds } from "../concurrency/stamp.js";
import type { EntryListConfig } from "../concurrency/entries.js";
import type { Store } from "../contract.js";
import type { RecordReference, RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";

/** Merge from a kept copy onto the current record, retaining every independent change. */
export async function mergeCopyBase(input: {
  store: Store; reference: RecordReference; base: string; content: string; grammar: EntryListConfig | undefined; random?: () => number;
}): Promise<StoreResult<{ content: string; version: RecordVersion; clashed: boolean }>> {
  const current = await input.store.read({ reference: input.reference });
  if (current.status === "refused") return current;
  let incoming = input.content;
  if (input.grammar !== undefined) {
    if (input.random === undefined) throw new Error("An entry merge needs the edit's seeded ID stream");
    incoming = stampEntryIds(input.content, input.grammar, input.random);
  }
  const label = { actor: "checkout", time: new Date(0).toISOString() };
  const args = { record: input.reference, base: input.base, baseVersion: null, current: current.result.content,
    incoming, currentLabel: label, incomingLabel: label };
  const entry = input.grammar === undefined ? mergeLineText(args) : mergeEntryText(args, input.grammar);
  const merged = entry.conflicts.length === 0 ? entry : mergeLineText(args);
  return { status: "ok", result: { content: merged.content, version: current.result.version, clashed: merged.conflicts.length > 0 } };
}
