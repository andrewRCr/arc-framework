/** Allow only UID enrichment of terminal references and rename-to-former-slug projection. */
import type { ImportComparator } from "./import-comparison.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/index.js";

/** Compare the legacy transition rows through independently observed public owner lookups. */
export function importedLineageComparator(store: Store): ImportComparator {
  return {
    read: async (expected, target) => {
      const source = LineageRecordSchema.parse(JSON.parse(expected.content));
      if (source.kind !== "rename") return target.read({ reference: expected.reference });
      const found = await target.lookup({ kind: "slug", slug: SlugSchema.parse(source.origin.name) });
      if (found.status === "refused") return found;
      const record = await target.read({ reference: found.result.reference });
      if (record.status === "refused") return record;
      return { status: "ok", result: { ...record.result, fields: undefined,
        content: canonicalize({ formerSlug: source.origin.name, successor: found.result.reference.owner.name }) } };
    },
    normalize: async (expected, actual) => {
      const source = LineageRecordSchema.parse(JSON.parse(expected.content));
      const content = source.kind === "rename" ? canonicalize({ formerSlug: source.origin.name, successor: source.successors[0]?.name })
        : canonicalize(await enrichReferences(source, store));
      return { expected: { ...expected, content, fields: undefined }, actual: { ...actual, fields: undefined } };
    },
  };
}

async function enrichReferences(value: unknown, store: Store): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((entry) => enrichReferences(entry, store)));
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string") {
    let found = await store.lookup({ kind: "slug", slug: SlugSchema.parse(record.name) });
    if (found.status === "refused" && found.refusal.code === "not-found") {
      found = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(record.name) });
    }
    if (found.status === "refused") {
      if (found.refusal.code === "not-found") return record;
      throw new Error(`Comparison owner lookup refused: ${found.refusal.condition}`);
    }
    const owner = found.result.reference.owner;
    return owner.type === "work-item" ? { ...record, uid: owner.uid } : record;
  }
  return Object.fromEntries(await Promise.all(Object.entries(record).map(async ([key, entry]) => [key, await enrichReferences(entry, store)])));
}
