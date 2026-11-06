/** Parsed cohort changes and complete proposed membership observations. */
import { ParsedMetaRecordSchema } from "../../../active/meta-schema.js";
import { describeRecordConflicts } from "../../conflict-diagnostics.js";
import { observeRecords, type RuleObservation } from "../rule-support.js";
import { parseCohortDocument, type ParsedCohortDocument } from "./parser.js";
import type { StoreRecord } from "../../read.js";
import type { StoreView, WriteCheckInput } from "../../write-check.js";
import type { RecordReference } from "../../identity.js";
import { observeCohortHoldings, type CohortHolding, type CohortHoldingCandidate } from "./holdings.js";
import { cohortHoldingEdits } from "./holding-edits.js";
export { observeCohortHoldings, type CohortHoldingCandidate, type CohortHoldingSegment,
  type ResolvedCohortCandidate, type CohortHolding } from "./holdings.js";
export { cohortHoldingEdits, type CohortHoldingEdit } from "./holding-edits.js";
/** A document with proved parsed nesting fields and its observed placement. */
export interface CohortEvidence { readonly record: StoreRecord; readonly fields: ParsedCohortDocument }
/** A work unit with its proved membership field and observed placement. */
export interface CohortMemberEvidence { readonly record: StoreRecord; readonly cohort: string | null }
/** Read a new or changed cohort field without inventing a comparison over malformed prior content.
 * @param input - Cohort write versions.
 * @param key - Parsed field to compare.
 * @returns The next fields only when creation or a proved field change gives comparison authority.
 */
export function changedCohortFields(input: WriteCheckInput, key: keyof ParsedCohortDocument): ParsedCohortDocument | undefined {
  if (input.next === undefined) return undefined;
  const next = parseCohortDocument(input.next.content);
  if (!next.success) return undefined;
  if (input.prior === undefined) return next.data;
  const prior = parseCohortDocument(input.prior.content);
  return prior.success && prior.data[key] !== next.data[key] ? next.data : undefined;
}
/** Refuse evidence an open conflict could still change, naming the conflicts to resolve. */
function disputed(record: StoreRecord, evidence: string): { status: "unavailable"; condition: string } {
  return { status: "unavailable", condition: `The ${evidence} of ${record.reference.owner.name} is disputed by open conflicts.`
    + describeRecordConflicts(record.conflicts) };
}
/** Enumerate open cohort documents with no missing, malformed, or disputed evidence.
 * @param view - Proposed store state.
 * @returns Parsed open documents or an actionable incomplete observation.
 */
export function observeOpenCohorts(view: StoreView): Promise<RuleObservation<readonly CohortEvidence[]>> {
  return observeCohorts(view, "open");
}

async function observeCohorts(view: StoreView, scope: "open" | "all"): Promise<RuleObservation<readonly CohortEvidence[]>> {
  const listed = await observeRecords(view, { family: "cohort", kind: "cohort/document" });
  if (listed.status !== "known") return listed;
  const result: CohortEvidence[] = [];
  for (const record of listed.value) {
    if (scope === "open" && record.placement?.kind === "completed") continue;
    if (record.conflicts.length > 0) return disputed(record, "Parent");
    const parsed = parseCohortDocument(record.content);
    if (!parsed.success) return { status: "unavailable", condition: `${record.reference.owner.name}: ${parsed.error}` };
    result.push({ record, fields: parsed.data });
  }
  return { status: "known", value: result };
}
/** Enumerate open work-unit membership without treating unreadable or disputed fields as no membership.
 * @param view - Proposed store state.
 * @returns Every open membership or an actionable incomplete observation.
 */
export function observeOpenMembers(view: StoreView): Promise<RuleObservation<readonly CohortMemberEvidence[]>> {
  return observeMembers(view, "open");
}

async function observeMembers(view: StoreView, scope: "open" | "all"): Promise<RuleObservation<readonly CohortMemberEvidence[]>> {
  const listed = await observeRecords(view, { family: "work-item", kind: "work-item/meta" });
  if (listed.status !== "known") return listed;
  const result: CohortMemberEvidence[] = [];
  for (const record of listed.value) {
    if (scope === "open" && record.placement?.kind === "completed") continue;
    if (record.conflicts.length > 0) return disputed(record, "cohort membership");
    const parsed = ParsedMetaRecordSchema.safeParse(record.fields);
    if (!parsed.success) return { status: "unavailable", condition: `${record.reference.owner.name}: membership fields are unavailable.` };
    result.push({ record, cohort: parsed.data.cohort });
  }
  return { status: "known", value: result };
}

/** List open candidates in one view and resolve their paths in the caller-selected view. */
export function observeOpenHoldings(view: StoreView, resolve: StoreView, cohort: RecordReference): Promise<RuleObservation<readonly CohortHolding[]>> {
  return observeHoldings(view, resolve, cohort, "open");
}

/** Count every candidate-view holding, optionally resolving identities before a proposed removal. */
export function observeAllHoldings(view: StoreView, cohort: RecordReference, resolve: StoreView = view): Promise<RuleObservation<readonly CohortHolding[]>> {
  return observeHoldings(view, resolve, cohort, "all");
}

async function observeHoldings(view: StoreView, resolve: StoreView, cohort: RecordReference, scope: "open" | "all"): Promise<RuleObservation<readonly CohortHolding[]>> {
  const [cohorts, members] = await Promise.all([observeCohorts(view, scope), observeMembers(view, scope)]);
  if (cohorts.status !== "known") return cohorts;
  if (members.status !== "known") return members;
  const candidates: CohortHoldingCandidate[] = [];
  for (const { record, cohort: path } of members.value) {
    if (path !== null) candidates.push({ reference: record.reference, field: "cohort", path, completed: record.placement?.kind === "completed" });
  }
  for (const { record, fields } of cohorts.value) {
    if (fields.parent !== null) candidates.push({ reference: record.reference, field: "parent", path: fields.parent, completed: record.placement?.kind === "completed" });
  }
  return observeCohortHoldings(candidates, resolve, cohort);
}

/** Name exact holding owners without proposing a mutation to their references. */
export function describeCohortHoldingOwners(holdings: readonly CohortHolding[]): string {
  const holders = [...new Set(holdings.map(({ candidate }) => {
    const { owner } = candidate.reference;
    return `${owner.type} ${owner.name} (UID ${owner.type === "person" ? "unavailable" : owner.uid ?? "unavailable"})`;
  }))];
  return `The cohort is held by: ${holders.join(", ")}.`;
}

/** Name exact holders and the ordered field repairs supported by their resolved paths. */
export function describeCohortHoldings(holdings: readonly CohortHolding[], slug: string): string {
  const names = describeCohortHoldingOwners(holdings), edits = cohortHoldingEdits(holdings, slug);
  if (edits.status !== "known") return `${names} ${edits.status === "unavailable" ? edits.condition : "Holding edits are unavailable."}`;
  const repair = edits.value.map(edit => `${edit.record.type} ${edit.record.name} (UID ${edit.record.uid}): `
    + `${edit.field === "cohort" ? "Cohort" : "Parent"} ${JSON.stringify(edit.from)} -> ${JSON.stringify(edit.to)}.`).join(" ");
  return `${names}${repair === "" ? "" : ` Re-pointing edits, in order: ${repair}`}`;
}
