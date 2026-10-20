/** Allow only UID enrichment of terminal references and rename-to-former-slug projection. */
import type { ImportComparator } from "./import-comparison.js";
import type { Store, ReadOnlyStore } from "../../../src/lib/store/contract.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/index.js";

/** Compare the legacy transition rows through independently observed public owner lookups. */
export function importedLineageComparator(store: Store, sourceStore?: ReadOnlyStore): ImportComparator {
  return {
    read: async (expected, target) => {
      const source = LineageRecordSchema.parse(JSON.parse(expected.content));
      if (source.kind !== "rename") return target.read({ reference: expected.reference });
      let found = await target.lookup({ kind: "slug", slug: SlugSchema.parse(source.origin.name) });
      if (found.status === "refused" && found.refusal.code === "not-found") {
        found = await target.lookup({ kind: "lineage", origin: SlugSchema.parse(source.origin.name) });
      }
      if (found.status === "refused") return found;
      const record = await target.read({ reference: found.result.reference });
      if (record.status === "refused") return record;
      return { status: "ok", result: { ...record.result, fields: undefined,
        content: canonicalize({ formerSlug: source.origin.name, successor: found.result.reference.owner.name }) } };
    },
    normalize: async (expected, actual) => {
      const source = LineageRecordSchema.parse(JSON.parse(expected.content));
      const content = source.kind === "rename" ? canonicalize({ formerSlug: source.origin.name,
        successor: await finalSourceSuccessor(source.successors[0]?.name, sourceStore) })
        : canonicalize(await enrichReferences(source, store));
      return { expected: { ...expected, content, fields: undefined }, actual: { ...actual, fields: undefined } };
    },
  };
}

async function finalSourceSuccessor(name: string | undefined, source?: ReadOnlyStore): Promise<string | undefined> {
  const visited = new Set<string>();
  while (name && source) {
    if (visited.has(name)) throw new Error("The comparison source has a cyclic rename chain");
    visited.add(name);
    const next = await source.read({ reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name } }) });
    if (next.status === "refused") {
      if (next.refusal.code === "not-found") return name;
      throw new Error(`Comparison source rename read refused: ${next.refusal.condition}`);
    }
    const record = LineageRecordSchema.parse(JSON.parse(next.result.content));
    if (record.kind !== "rename") return name;
    name = record.successors[0]?.name;
  }
  return name;
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
