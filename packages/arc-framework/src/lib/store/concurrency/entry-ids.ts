/** Admission of already stored identities before identity-keyed reconciliation. */
import { splitEntryList, type EntryListConfig } from "./entries.js";

/** The first identity that prevents a document from being merged by entry. */
export type EntryIdProblem = { kind: "missing" } | { kind: "duplicate"; id: string };

/** Preserve stored bytes while identifying missing or repeated managed IDs. */
export function entryIdProblem(content: string, grammar: EntryListConfig): EntryIdProblem | undefined {
  const seen = new Set<string>();
  for (const part of splitEntryList(content, grammar).parts) {
    if (part.kind !== "entry") continue;
    if (!part.id) return { kind: "missing" };
    if (seen.has(part.id)) return { kind: "duplicate", id: part.id };
    seen.add(part.id);
  }
  return undefined;
}
