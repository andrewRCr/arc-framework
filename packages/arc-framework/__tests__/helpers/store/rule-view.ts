/** Map-backed read views with real record envelopes and explicit exceptional lookups. */
import {
  OwnerIdentitySchema, RecordVersionSchema, StoreRecordSchema, recordReferences, sameReference, sameOwner,
  type LookupInput, type LookupResult, type ReadPlacement, type StoreRecord, type StoreResult, type StoreView,
} from "../../../src/lib/store/index.js";

/** Build a validated fixture record with a stable generation and canonical placement.
 * @param kind - Registered singleton role.
 * @param name - Current owner name.
 * @param uid - Generation UUID.
 * @param content - Exact stored bytes.
 * @param fields - Parsed content supplied by the producer.
 * @param placement - Primary lifecycle location, or undefined for cohort/lineage.
 * @returns A validated contract record.
 */
export function ruleRecord(kind: "work-item/meta" | "work-item/record" | "work-item/task-list" | "work-item/draft" | "work-item/spec" | "work-item/inbound" | "cohort/document" | "lineage/transition", name: string, uid: string, content = "", fields?: unknown, placement?: ReadPlacement): StoreRecord {
  const type = kind === "cohort/document" ? "cohort" : "work-item";
  const owner = OwnerIdentitySchema.parse({ type, name, uid });
  const reference = recordReferences[kind](owner);
  return StoreRecordSchema.parse({ reference, content, fields, version: RecordVersionSchema.parse("fixture-version"),
    formatVersion: 1, conflicts: [], ...(placement === undefined && kind.startsWith("work-item/")
      ? { placement: { kind: "active" } } : { placement }) });
}

/** Exact exceptional lookup outcomes, keyed by the input discriminant and value. */
export type RuleLookups = ReadonlyMap<string, StoreResult<LookupResult>>;

/** Create a pure view whose normal lookups prefer live primary records.
 * @param records - Stored records in this side of the batch.
 * @param lookups - Explicit former-name, retired-origin, or refusal observations.
 * @returns The three read-only contract operations.
 */
export function ruleView(records: readonly StoreRecord[] = [], lookups: RuleLookups = new Map()): StoreView {
  return {
    read: async ({ reference }) => {
      const candidates = records.filter((candidate) => sameReference(candidate.reference, reference)
        || (!("uid" in reference.owner) || reference.owner.uid === undefined)
          && candidate.reference.kind === reference.kind && candidate.reference.owner.type === reference.owner.type
          && candidate.reference.owner.name === reference.owner.name && JSON.stringify(candidate.reference.key) === JSON.stringify(reference.key));
      const live = candidates.filter((record) => record.placement?.kind !== "completed");
      const selected = live.length > 0 ? live : candidates;
      if (selected.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
        candidates: selected.map(({ reference }) => reference), condition: "Multiple fixture generations match.", remedy: { text: "Choose a unique fixture name." } } };
      return selected.length === 0 ? missing({ reference }) : { status: "ok", result: selected[0]! };
    },
    list: async ({ family, kind, owner, filter }) => {
      const selected = records.filter((record) => record.reference.kind.startsWith(`${family}/`)
        && (kind === undefined || record.reference.kind === kind)
        && (owner === undefined || sameOwner(record.reference.owner, owner))
        && (filter?.locations === undefined || (record.placement !== undefined && filter.locations.includes(record.placement.kind === "backlog"
          ? record.placement.commitment : record.placement.kind))));
      return { status: "ok", result: selected.length === 0 ? { status: "absent" }
        : { status: "complete", records: selected, diagnostics: [], missed: false } };
    },
    lookup: async (input) => {
      if (input.kind !== "slug" && input.kind !== "lineage") throw new Error(`Unexpected rule lookup: ${input.kind}`);
      const key = input.kind === "slug" ? input.slug : input.origin;
      const override = lookups.get(`${input.kind}:${key}`);
      if (override !== undefined) return override;
      const candidates = records.filter((record) => input.kind === "slug"
        ? ["work-item/meta", "work-item/record"].includes(record.reference.kind) && record.reference.owner.name === key
        : record.reference.kind === "lineage/transition" && (record.reference.owner.name === key || ("uid" in record.reference.owner && record.reference.owner.uid === key)));
      const live = candidates.filter((record) => record.placement?.kind !== "completed");
      const resolved = live.length > 0 ? live : candidates;
      if (resolved.length === 0) return missing({ lookup: input });
      if (resolved.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
        candidates: resolved.map(({ reference }) => reference), condition: "Multiple fixture generations match.", remedy: { text: "Choose a unique fixture name." } } };
      return { status: "ok", result: { reference: resolved[0]!.reference } };
    },
  };
}
function missing(locus: { reference?: StoreRecord["reference"]; lookup?: LookupInput }): Extract<StoreResult<never>, { status: "refused" }> {
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", ...locus,
    condition: "No fixture record matches.", remedy: { text: "Create the missing fixture record." } } };
}
