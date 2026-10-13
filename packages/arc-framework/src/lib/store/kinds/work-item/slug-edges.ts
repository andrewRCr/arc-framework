/** Dependency-edge protection when a work item acquires another generation's name. */
import { ParsedMetaRecordSchema } from "../../../active/meta-schema.js";
import { sameOwner, type OwnerIdentity } from "../../identity.js";
import type { StoreRecord } from "../../read.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { LineageRecordSchema } from "../lineage/schema.js";
import { brokenRule, observeRecord, observeRecords, type RuleObservation } from "../rule-support.js";
import { acquiresSlug } from "./slug-acquisition.js";

const rule = "work-item.slug-edges";
const remedy = "The dependent's owner settles Depends On with arc wu reconcile --apply from its checkout, after arc resume for a parked work unit, or edits Depends On if reconcile refuses. Anyone may edit a stub's edge; otherwise choose another slug. Restore unavailable state and retry.";

async function priorTarget(input: WriteCheckInput): Promise<RuleObservation<OwnerIdentity>> {
  const slug = input.reference.owner.name;
  const primary = await input.before.lookup({ kind: "slug", slug });
  if (primary.status === "ok") return { status: "known", value: primary.result.reference.owner };
  if (primary.refusal.code !== "not-found") return { status: "unavailable", condition: primary.refusal.condition };
  const lineage = await input.before.lookup({ kind: "lineage", origin: slug });
  if (lineage.status === "refused") return lineage.refusal.code === "not-found" ? { status: "absent" }
    : { status: "unavailable", condition: lineage.refusal.condition };
  const record = await observeRecord(input.before, lineage.result.reference);
  if (record.status !== "known") return { status: "unavailable", condition: "The resolved lineage record cannot be read." };
  const parsed = LineageRecordSchema.safeParse(record.value.fields);
  if (!parsed.success || parsed.data.origin.name !== slug || parsed.data.kind === "rename") {
    return { status: "unavailable", condition: "The lineage observation does not establish this slug's retired origin." };
  }
  return { status: "known", value: record.value.reference.owner };
}

async function survivingEdge(input: WriteCheckInput, record: StoreRecord): Promise<RuleObservation<boolean>> {
  if (record.placement?.kind === "completed") return { status: "known", value: false };
  const prior = ParsedMetaRecordSchema.safeParse(record.fields);
  if (!prior.success) return { status: "unavailable", condition: `Cannot read the prior dependency edges of \`${record.reference.owner.name}\`.` };
  if (!prior.data.dependsOn.includes(input.reference.owner.name)) return { status: "known", value: false };
  const after = await observeRecord(input.after, record.reference);
  if (after.status === "absent") return { status: "known", value: false };
  if (after.status === "unavailable") return after;
  if (after.value.reference.kind !== "work-item/meta" || after.value.placement?.kind === "completed") return { status: "known", value: false };
  const next = ParsedMetaRecordSchema.safeParse(after.value.fields);
  return next.success ? { status: "known", value: next.data.dependsOn.includes(input.reference.owner.name) }
    : { status: "unavailable", condition: `Cannot read the resulting dependency edges of \`${record.reference.owner.name}\`.` };
}

/** Check surviving edges before a slug is reused.
 * @param input - Proposed primary write and both views.
 * @returns The slug-edge violation, naming every observed unsettled dependent.
 */
export async function checkSlugEdges(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const acquired = await acquiresSlug(input);
  if (acquired.status !== "known") return [brokenRule(rule, acquired.status === "unavailable" ? acquired.condition : "Name acquisition is unavailable.", remedy)];
  if (!acquired.value) return [];
  const target = await priorTarget(input);
  if (target.status === "unavailable") return [brokenRule(rule, target.condition, remedy)];
  if (target.status === "absent" || sameOwner(target.value, input.reference.owner)) return [];
  const listed = await observeRecords(input.before, { family: "work-item", kind: "work-item/meta" });
  if (listed.status !== "known") return [brokenRule(rule, listed.status === "unavailable" ? listed.condition : "Dependency enumeration is unavailable.", remedy)];
  const blocked: string[] = [];
  for (const record of listed.value) {
    const survives = await survivingEdge(input, record);
    if (survives.status !== "known") return [brokenRule(rule, survives.status === "unavailable" ? survives.condition : "Dependency evidence is unavailable.", remedy)];
    if (survives.value) blocked.push(record.reference.owner.name);
  }
  blocked.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return blocked.length === 0 ? [] : [brokenRule(rule,
    `Depends On edges in ${blocked.map((name) => `\`${name}\``).join(", ")} still name \`${input.reference.owner.name}\` for another generation.`, remedy)];
}
