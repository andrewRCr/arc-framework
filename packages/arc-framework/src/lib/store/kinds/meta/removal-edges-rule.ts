/** Atomic admission for decomposition removals and surviving dependency or pause edges. */
import { ParsedMetaRecordSchema } from "../../../active/meta-schema.js";
import { SlugSchema } from "../../../kernel/index.js";
import { sameOwner, recordReferences } from "../../identity.js";
import { parseLineageRecord } from "../lineage/parser.js";
import type { StoreRecord } from "../../read.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { brokenRule, observeRecord, observeRecords, type RuleObservation } from "../rule-support.js";

const rule = "meta.decompose-removal-edges";
const remedy = "Retarget or drop the named Depends On edges through write-back; settle pause edges with arc pause <owner> --waits-on <other>, --waits-on-note <text>, or --no-waits-on. Restore unavailable evidence, then retry decomposition.";
type RemovalEvidence<T> = Exclude<RuleObservation<T>, { status: "absent" }>;

async function removedNames(input: WriteCheckInput): Promise<RemovalEvidence<ReadonlySet<string>>> {
  const before = await observeRecord(input.before, input.reference);
  if (before.status !== "known") return { status: "unavailable", condition: before.status === "unavailable"
    ? before.condition : "The removed primary's identity is unavailable." };
  const names = new Set([before.value.reference.owner.name]);
  for (const alias of before.value.aliases ?? []) {
    if (names.has(alias)) continue;
    const lookup = await input.before.lookup({ kind: "slug", slug: SlugSchema.parse(alias) });
    if (lookup.status === "refused") {
      if (lookup.refusal.code === "not-found") continue;
      return { status: "unavailable", condition: lookup.refusal.condition };
    }
    if (sameOwner(lookup.result.reference.owner, input.reference.owner)) names.add(alias);
  }
  return { status: "known", value: names };
}

function survivingEdges(record: StoreRecord, names: ReadonlySet<string>): RemovalEvidence<readonly string[]> {
  if (record.placement?.kind === "completed") return { status: "known", value: [] };
  const fields = ParsedMetaRecordSchema.safeParse(record.fields);
  const owner = record.reference.owner.name;
  if (!fields.success) return { status: "unavailable", condition: `Cannot read the surviving edges of ${owner}.` };
  const edges = fields.data.dependsOn.filter(name => names.has(name)).map(name => `${owner}.Depends On → ${name}`);
  const wait = fields.data.pause?.waitsOn;
  if (wait?.kind === "work-unit" && names.has(wait.slug)) edges.push(`${owner}.pause.waits-on → ${wait.slug}`);
  return { status: "known", value: edges };
}

async function retainedProvider(input: WriteCheckInput): Promise<RemovalEvidence<boolean>> {
  const lineage = await observeRecord(input.after, recordReferences["lineage/transition"](input.reference.owner));
  if (lineage.status === "unavailable") return lineage;
  if (lineage.status === "known") {
    const terminal = parseLineageRecord(lineage.value.content);
    if (terminal !== null && terminal.kind !== "rename") {
      if (terminal.origin.name !== input.reference.owner.name
        || input.reference.owner.type !== "work-item"
        || terminal.origin.uid !== undefined && terminal.origin.uid !== input.reference.owner.uid)
        return { status: "unavailable", condition: "Terminal lineage does not establish the removed generation." };
      return { status: "known", value: true };
    }
  }
  return { status: "known", value: false };
}

/** Refuse a decompose removal when the complete proposed after-state still names its generation. */
export async function checkMetaRemovalEdges(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "decompose" || input.prior === undefined || input.next !== undefined) return [];
  const fail = (condition: string) => [brokenRule(rule, condition, remedy)];
  const retained = await retainedProvider(input);
  if (retained.status === "unavailable") return fail(retained.condition);
  if (retained.value) return [];
  const names = await removedNames(input);
  if (names.status !== "known") return fail(names.condition);
  const records = await observeRecords(input.after, { family: "work-item", kind: "work-item/meta" });
  if (records.status !== "known") return fail(records.status === "unavailable" ? records.condition : "Surviving edges are unavailable.");
  const edges: string[] = [];
  for (const record of records.value) {
    const observed = survivingEdges(record, names.value);
    if (observed.status !== "known") return fail(observed.condition);
    edges.push(...observed.value);
  }
  return edges.length === 0 ? [] : fail(`Surviving edges name the removed primary: ${edges.join("; ")}.`);
}
