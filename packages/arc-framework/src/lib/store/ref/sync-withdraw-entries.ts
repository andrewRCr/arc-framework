/** Remove only entry identities added by the withdrawn batch and absent from published state. */

import { splitEntryList, rejoinEntryList } from "../concurrency/index.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { decodeReference, refOwner } from "./codec.js";
import { parseRefMetadata } from "./metadata.js";
import type { EntryConfig } from "../registry.js";

/** The original write and the independently published and locally merged records. */
export interface WithdrawEntrySides {
  before?: RefTreeEntry; after?: RefTreeEntry; current?: RefTreeEntry; published?: RefTreeEntry;
}

/** Return a selective inverse for a declared entry document; other records use their whole value. */
export function inverseAddedEntries(context: RefBackendContext, ref: string, path: string, sides: WithdrawEntrySides,
  after: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): string | undefined {
  if (!sides.current || !sides.after) return undefined;
  const grammar = entryGrammar(context, ref, path, after, objects);
  if (!grammar) return undefined;
  const before = entryIds(content(sides.before, objects), grammar), published = entryIds(content(sides.published, objects), grammar);
  const added = new Set([...entryIds(content(sides.after, objects), grammar)].filter((id) => !before.has(id)));
  if (!added.size) return undefined;
  const split = splitEntryList(content(sides.current, objects), grammar);
  return rejoinEntryList({ parts: split.parts.filter((part) => part.kind !== "entry" || !part.id || !added.has(part.id) || published.has(part.id)) });
}

function entryGrammar(context: RefBackendContext, ref: string, path: string,
  entries: ReadonlyMap<string, RefTreeEntry>, objects: ReadonlyMap<string, BatchObject | null>): EntryConfig | undefined {
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return undefined;
  const prototype = refPrototype(context, live, family), home = expandStoredPath(prototype, { registry: context.registry });
  const metadataEntry = entries.get(home.metadataPath), metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : undefined);
  if (!metadata) return undefined;
  const reference = decodeReference(context, refOwner(live, family, metadata), family, path, metadata);
  return reference && "owner" in reference ? context.registry[reference.kind].entry : undefined;
}
function content(entry: RefTreeEntry | undefined, objects: ReadonlyMap<string, BatchObject | null>): string {
  if (!entry) return "";
  const object = objects.get(entry.oid);
  if (object?.type !== "blob") throw new Error("A withdrawn entry document is unavailable");
  return new TextDecoder("utf-8", { fatal: true }).decode(object.bytes);
}
function entryIds(content: string, grammar: EntryConfig): Set<string> {
  return new Set(splitEntryList(content, grammar).parts.flatMap((part) => part.kind === "entry" && part.id ? [part.id] : []));
}
