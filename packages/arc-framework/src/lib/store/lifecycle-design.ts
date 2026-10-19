/** Resolve a work unit's Design references against its identity-owned records. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { ParsedDesignRecordSchema } from "./kinds/design/index.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import { workUnitArtifactName } from "./lifecycle-write.js";
import { companionArtifactName } from "./companion-name.js";

/** Preferred design content and its decoded record, retaining acquisition diagnostics. */
export interface LifecycleDesignResult {
  record: StoreRecord | null;
  content: string | null;
  warnings: string[];
}

/** Select a design by its listed artifact name and parsed Purpose, independent of placement.
 * @param meta - Selected identity and decoded Design field basis.
 * @param candidates - Records belonging to that identity.
 * @returns First listed design with a raw Purpose, or the first matching design.
 */
export function selectLifecycleDesign(
  meta: Pick<StoreRecord, "reference" | "fields">,
  candidates: readonly StoreRecord[],
): StoreRecord | null {
  const fields = ParsedMetaRecordSchema.safeParse(meta.fields);
  if (!fields.success) return null;
  let fallback: StoreRecord | null = null;
  for (const name of fields.data.design) {
    const record = candidates.find(candidate => designArtifactName(meta.reference.owner.name, candidate) === name);
    if (record === undefined) continue;
    fallback ??= record;
    const design = ParsedDesignRecordSchema.safeParse(record.fields);
    if (design.success && design.data.purpose !== null) return record;
  }
  return fallback;
}

function designArtifactName(slug: string, record: StoreRecord): string | null {
  const { kind, key } = record.reference;
  if (kind === "work-item/spec" || kind === "work-item/draft") {
    return workUnitArtifactName(slug, kind === "work-item/spec" ? "spec" : "draft");
  }
  return kind === "work-item/companion" && typeof key === "string" ? companionArtifactName(slug, key) : null;
}

/** Read the preferred design without treating report paths as authority.
 * @param store - Same operational store as the metadata read.
 * @param meta - Selected identity and Design field basis.
 * @returns Preferred readable design record and content, or absence with diagnostic warnings.
 */
export async function readLifecycleDesign(store: Store, meta: StoreRecord): Promise<LifecycleDesignResult> {
  const absent = { record: null, content: null };
  const fields = ParsedMetaRecordSchema.safeParse(meta.fields);
  if (!fields.success) return { ...absent, warnings: ["Metadata fields are invalid; Design is unavailable."] };
  if (fields.data.design.length === 0) return { ...absent, warnings: [] };
  const listing = await store.list({ family: "work-item", owner: meta.reference.owner });
  if (listing.status === "refused") return { ...absent, warnings: [listing.refusal.condition] };
  if (listing.result.status !== "complete") return { ...absent, warnings: listing.result.status === "unreadable" ? [listing.result.condition] : [] };
  const record = selectLifecycleDesign(meta, listing.result.records);
  return { record, content: record?.content ?? null, warnings: listing.result.diagnostics.map(diagnostic => diagnostic.condition) };
}
