/** Digest compatibility for title-bound captures carried by older partial Errand markers. */
import { inboxEntrySourceDigest } from "../user-sync/inbox-writer.js";
/** Qualify the original capture with the exact legacy normalization. */
export function legacyInboxEntryDigest(content: string, title: string): string {
  return inboxEntrySourceDigest(content, title);
}
