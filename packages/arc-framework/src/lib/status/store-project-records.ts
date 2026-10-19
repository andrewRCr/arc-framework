/** Acquire design purposes and map selected lifecycle generations into readiness records. */
import type { Store } from "../store/contract.js";
import { MetaPauseSchema } from "../active/meta-schema.js";
import { identityKey, type LifecycleEntry } from "../store/lifecycle-index.js";
import type { StoreRecord } from "../store/read.js";
import { selectLifecycleDesign } from "../store/lifecycle-design.js";
import { ParsedDesignRecordSchema } from "../store/kinds/design/schema.js";
import { validateClass, validatePriority } from "../kernel/schema/vocabulary.js";
import { extractPurposeSentence } from "./work-unit-purpose.js";
import { listingDiagnosticWarnings, storeReadFailureWarning } from "./store-project-diagnostics.js";
import type { ProjectReadinessRecord, ProjectReadinessWarning } from "./project-view.js";

/** Readiness records plus diagnostics from the design inventories. */
export interface StoreProjectRecords {
  records: ProjectReadinessRecord[];
  warnings: ProjectReadinessWarning[];
}

/** Read each design inventory once and retain generation-specific fields and purposes. */
export async function readStoreProjectRecords(store: Store, entries: readonly LifecycleEntry[]): Promise<StoreProjectRecords> {
  const listings = await Promise.all((["work-item/spec", "work-item/draft", "work-item/companion"] as const)
    .map(kind => store.list({ family: "work-item", kind })));
  const designs = new Map<string, StoreRecord[]>();
  const warnings: ProjectReadinessWarning[] = [];
  for (const listing of listings) {
    if (listing.status === "refused") {
      warnings.push(storeReadFailureWarning(listing.refusal));
      continue;
    }
    if (listing.result.status === "unreadable") {
      warnings.push(storeReadFailureWarning(listing.result));
      continue;
    }
    if (listing.result.status !== "complete") continue;
    warnings.push(...listingDiagnosticWarnings(listing.result.diagnostics));
    for (const record of listing.result.records) {
      const key = identityKey(record.reference.owner);
      const group = designs.get(key) ?? [];
      group.push(record);
      designs.set(key, group);
    }
  }
  if (warnings.some(warning => warning.code === "store-read-failed")) designs.clear();
  return { records: entries.map(entry => {
    const { fields, location } = entry;
    const source = { kind: "store" as const, location };
    return { slug: entry.reference.owner.name, location, state: entry.phase,
      ...(fields.owner === null ? {} : { owner: fields.owner }),
      priority: validatePriority(fields.priority), class: validateClass(fields.workClass),
      dependsOn: [...fields.dependsOn], ...(fields.cohort === null ? {} : { cohort: fields.cohort }),
      ...(fields.pause === null ? {} : { pause: MetaPauseSchema.parse(fields.pause) }),
      source, sources: [source], purpose: purposeOf(entry, designs.get(identityKey(entry.reference.owner)) ?? []) };
  }), warnings };
}

function purposeOf(entry: LifecycleEntry, candidates: readonly StoreRecord[]): string | null {
  const selected = selectLifecycleDesign(entry, candidates);
  const fields = ParsedDesignRecordSchema.safeParse(selected?.fields);
  return fields.success ? extractPurposeSentence(fields.data.purpose) : null;
}
