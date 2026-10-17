/** Pure parser admission and content preparation shared by local writes and import. */
import type { RecordReference, RecordVersion } from "../identity.js";
import type { KindDefinition, EntryConfig } from "../registry.js";
import type { KindId } from "../catalog.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { createHash } from "node:crypto";
import { stampEntryIds, splitEntryList } from "../concurrency/index.js";
import { maskComments } from "../concurrency/entries.js";

/** Prepare incoming bytes before owner resolution, retaining their original mutation basis. */
export function prepareRefPut(reference: RecordReference, expected: RecordVersion | null, content: string,
  registry: Readonly<Record<KindId, KindDefinition>>): StoreResult<string> {
  const kind = registry[reference.kind];
  const parsed = kind.parser?.(content);
  if (parsed?.success === false) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference, rule: "store.parser", condition: parsed.error, remedy: { text: "Correct the parser's content error, then retry." } } };
  if (kind.merge === "entry" && !kind.entry) return { status: "refused", refusal: {
    code: "unsupported", class: "terminal", case: "unhomed-kind", condition: `No entry grammar is declared for ${reference.kind}`,
    remedy: { text: "Declare this kind's entry grammar in the constructed registry, then retry." },
  } };
  if (kind.merge === "entry" && kind.entry) {
    const refusal = entryProblem(reference, content, kind.entry);
    if (refusal) return { status: "refused", refusal };
    return { status: "ok", result: stampEntryIds(content, kind.entry, entryRandom(reference, expected, content)) };
  }
  return { status: "ok", result: content };
}

function entryProblem(reference: RecordReference, content: string, config: EntryConfig): StoreRefusal | undefined {
  const seen = new Set<string>();
  for (const entry of splitEntryList(content, config).parts.filter((part) => part.kind === "entry")) {
    if (entry.id && seen.has(entry.id)) return { code: "record-malformed", class: "recoverable", reference, rule: "entry-id",
      condition: `Entry ID ${entry.id} occurs more than once.`,
      remedy: { text: "Give the later entry a fresh ID or drop its ID line for stamping, then retry." } };
    if (entry.id) seen.add(entry.id);
    if (config.shape === "field-header" && !maskComments(entry.bytes).split(/\r?\n/u).some((line) => /^[_*]Remove when:/u.test(line.trim()))) {
      const [label] = entry.bytes.split(/\r?\n/u, 1);
      return { code: "record-malformed", class: "recoverable", reference, rule: "entry-id",
        condition: `Entry ${label} has no removal trigger.`,
        remedy: { text: "Add a _Remove when:_ line to the named memory, then retry." } };
    }
  }
  return undefined;
}

function entryRandom(reference: RecordReference, expected: RecordVersion | null, content: string): () => number {
  const seed = createHash("sha256").update(JSON.stringify([reference, expected, content])).digest();
  let counter = 0;
  let bytes: Buffer = Buffer.alloc(0);
  let offset = 0;
  return () => {
    if (offset + 4 > bytes.length) {
      bytes = createHash("sha256").update(seed).update(String(counter++)).digest();
      offset = 0;
    }
    const draw = bytes.readUInt32BE(offset) / 0x100000000;
    offset += 4;
    return draw;
  };
}
