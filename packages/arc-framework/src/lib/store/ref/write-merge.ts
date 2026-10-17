/** Historical stale-base merging, with validation of the bytes that will land. */

import type { TextConflictRecord } from "../conflict.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedMutation } from "./write-resolution.js";
import { readRefHistoryDetails } from "./history.js";
import { mergeEntryText, mergeLineText, splitEntryList } from "../concurrency/index.js";
import type { RecordReference, RecordVersion } from "../identity.js";
import { checkSerializationRules } from "../serialization.js";
import { readMergeLabels } from "./side-labels.js";
import type { EntryConfig } from "../registry.js";

/** Mutation bytes and the preserved clashes produced while merging them. */
export interface PreparedRefMutation extends ResolvedMutation { conflicts: TextConflictRecord[] }

/** Merge a stale put, or report an absent historical base without changing trees. */
export async function mergeRefMutation(context: RefBackendContext, write: ResolvedMutation,
  tip: string, currentVersion: RecordVersion): Promise<StoreResult<PreparedRefMutation | null>> {
  const { mutation, home } = write;
  if (mutation.action !== "put") throw new Error("Only puts have merge content");
  const history = await readRefHistoryDetails(context, mutation.reference, home, tip);
  if (history.status === "refused") return history;
  const base = history.result.find(({ entry }) => entry.version === mutation.expected)?.entry;
  const current = history.result.find(({ entry }) => entry.version === currentVersion);
  if (!base || base.content === null || !current || current.entry.content === null) return { status: "ok", result: null };
  const definition = context.registry[mutation.reference.kind];
  if (definition.entry) {
    for (const side of [base, current.entry]) {
      const problem = historicalEntryProblem(side.reference, side.content ?? "", side.version, definition.entry);
      if (problem) return { status: "refused", refusal: problem };
    }
  }
  const labels = await readMergeLabels(context, current.revision);
  const input = { record: mutation.reference, base: base.content, baseVersion: mutation.expected,
    current: current.entry.content, incoming: mutation.content, ...labels };
  const merged = definition.merge === "entry" && definition.entry ? mergeEntryText(input, definition.entry) : mergeLineText(input);
  const serialization = checkSerializationRules(mutation.reference, merged.content);
  const parsed = definition.parser?.(merged.content);
  if (serialization || parsed?.success === false) return { status: "refused", refusal: {
    ...(serialization ?? { code: "record-malformed" as const, class: "recoverable" as const, reference: mutation.reference,
      rule: "store.parser", condition: parsed?.success === false ? parsed.error : "Invalid merged content" }),
    remedy: { text: "Read the record and write corrected content again over its current version." },
  } };
  return { status: "ok", result: { ...write, mutation: { ...mutation, content: merged.content }, conflicts: merged.conflicts } };
}

function historicalEntryProblem(reference: RecordReference, content: string, version: RecordVersion | null,
  grammar: EntryConfig) {
  const seen = new Set<string>();
  for (const part of splitEntryList(content, grammar).parts) {
    if (part.kind !== "entry") continue;
    if (!part.id || seen.has(part.id)) return { code: "record-malformed" as const, class: "recoverable" as const,
      reference, rule: "entry-id", condition: `Stored version ${version} has ${part.id ? `repeated entry ID ${part.id}` : "an entry without an ID"}.`,
      remedy: { text: "Write the record over its current version with distinct entry IDs, then retry." } };
    seen.add(part.id);
  }
  return undefined;
}
