/** Resolve a work unit's Design references against its identity-owned records. */
import { posix } from "node:path";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { readDesignPurpose } from "./kinds/design/index.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";

/** Read the preferred design's content without treating report paths as authority.
 * @param store - Same operational store as the metadata read.
 * @param meta - Selected identity and Design field basis.
 * @returns Preferred readable design content, or absence with diagnostic warnings.
 */
export async function readLifecycleDesign(store: Store, meta: StoreRecord): Promise<{ content: string | null; warnings: string[] }> {
  const fields = ParsedMetaRecordSchema.safeParse(meta.fields);
  if (!fields.success) return { content: null, warnings: ["Metadata fields are invalid; Design is unavailable."] };
  if (fields.data.design.length === 0) return { content: null, warnings: [] };
  const listing = await store.list({ family: "work-item", owner: meta.reference.owner });
  if (listing.status === "refused") return { content: null, warnings: [listing.refusal.condition] };
  if (listing.result.status !== "complete") return { content: null, warnings: listing.result.status === "unreadable" ? [listing.result.condition] : [] };
  let fallback: string | null = null;
  for (const name of fields.data.design) {
    const record = listing.result.records.find((candidate) => {
      const kind = candidate.reference.kind;
      if (kind !== "work-item/spec" && kind !== "work-item/draft" && kind !== "work-item/companion") return false;
      const path = lifecycleRecordPath(meta, candidate);
      return path !== null && posix.basename(path) === name;
    });
    if (record === undefined) continue;
    fallback ??= record.content;
    if (readDesignPurpose(record.content) !== null) return { content: record.content, warnings: listing.result.diagnostics.map((diagnostic) => diagnostic.condition) };
  }
  return { content: fallback, warnings: listing.result.diagnostics.map((diagnostic) => diagnostic.condition) };
}
