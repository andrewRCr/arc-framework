/** Restore missing entry identities and deterministically replace editor-created duplicates. */
import { CANONICAL_DIGEST_PREFIX, canonicalize, digestBytes } from "../../kernel/canonical/canonical-json.js";
import type { RecordReference } from "../identity.js";
import { maskComments, rejoinEntryList, splitEntryList, type EntryListConfig, type ListEntry } from "../concurrency/entries.js";
import { drawId } from "../concurrency/stamp.js";
import { restoreEntryIds } from "./taken-in.js";

/** Draw a repeatable stream from the exact reference, base, and edited content. */
export function createEntryIdStream(reference: RecordReference, base: string, content: string): () => number {
  const seed = digestBytes(Buffer.from(JSON.stringify([canonicalize(reference), base, content]), "utf8"));
  let counter = 0;
  return () => {
    const block = digestBytes(Buffer.from(JSON.stringify([seed, counter++]), "utf8"));
    return Number.parseInt(block.slice(CANONICAL_DIGEST_PREFIX.length, CANONICAL_DIGEST_PREFIX.length + 8), 16) / 0x1_0000_0000;
  };
}

/** Repair duplicates before matching missing IDs, retaining the stream for first-persist stamping. */
export function restoreWriteBackIds(input: {
  reference: RecordReference; base: string; content: string; grammar: EntryListConfig;
}): { content: string; random: () => number } {
  const random = createEntryIdStream(input.reference, input.base, input.content);
  const split = splitEntryList(input.content, input.grammar);
  const used = new Set(split.parts.flatMap(part => part.kind === "entry" && part.id !== undefined ? [part.id] : []));
  const seen = new Set<string>();
  const parts = split.parts.map(part => {
    if (part.kind !== "entry" || part.id === undefined) return part;
    if (!seen.has(part.id)) {
      seen.add(part.id);
      return part;
    }
    const id = drawId(used, random);
    used.add(id);
    return { ...part, id, bytes: replaceId(part, id) };
  });
  const content = restoreEntryIds(rejoinEntryList({ parts }), input.base, input.grammar);
  return { content, random };
}

function replaceId(entry: ListEntry, id: string): string {
  const match = /_Id:_\s*`([0-9a-f]{8})`/u.exec(maskComments(entry.bytes));
  if (match === null) throw new Error("The entry's managed ID has no visible field");
  const offset = match.index + match[0].indexOf("`") + 1;
  return entry.bytes.slice(0, offset) + id + entry.bytes.slice(offset + 8);
}
