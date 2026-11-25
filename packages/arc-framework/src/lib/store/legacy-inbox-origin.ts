/** Digest compatibility for title-bound captures carried by older partial Errand markers. */
import { inboxEntrySourceDigest } from "../user-sync/inbox-writer.js";
import { maskComments, rejoinEntryList, splitEntryList } from "./concurrency/entries.js";
import { ENTRY_CONFIGS } from "./kinds/entry-configs.js";
import { matchInboxEntryTitle } from "./kinds/entry-fields.js";
/** Qualify the original capture, allowing only an import-added ID to differ.
 * @param expectedDigest - Marker digest selects the unchanged or reconstructed pre-import form.
 */
export function legacyInboxEntryDigest(content: string, title: string, expectedDigest?: string): string {
  const current = inboxEntrySourceDigest(content, title);
  if (expectedDigest === undefined || current === expectedDigest) return current;
  const split = splitEntryList(content, ENTRY_CONFIGS["personal/inbox"]);
  const parts = split.parts.map(part => {
    if (part.kind !== "entry") return part;
    const visible = maskComments(part.bytes);
    if (matchInboxEntryTitle(visible.split("\n")[0] ?? "") !== title.trim()) return part;
    const id = /^- _Id:_ `[0-9a-f]{8}`(?:\r?\n|$)/mu.exec(visible);
    return id === null ? part : { ...part, bytes: part.bytes.slice(0, id.index) + part.bytes.slice(id.index + id[0].length) };
  });
  return inboxEntrySourceDigest(rejoinEntryList({ parts }), title);
}
