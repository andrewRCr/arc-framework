/** Parsed cohort changes and complete proposed membership observations. */
import { ParsedMetaRecordSchema } from "../../../active/meta-schema.js";
import { observeRecords, type RuleObservation } from "../rule-support.js";
import { parseCohortDocument, type ParsedCohortDocument } from "./parser.js";
import type { StoreRecord } from "../../read.js";
import type { StoreView, WriteCheckInput } from "../../write-check.js";
/** An open document with proved parsed nesting fields. */
export interface OpenCohort { readonly record: StoreRecord; readonly fields: ParsedCohortDocument }
/** An open work unit with its proved membership field. */
export interface OpenMember { readonly record: StoreRecord; readonly cohort: string | null }
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
/** Enumerate open cohort documents with no missing or malformed evidence.
 * @param view - Proposed store state.
 * @returns Parsed open documents or an actionable incomplete observation.
 */
export async function observeOpenCohorts(view: StoreView): Promise<RuleObservation<readonly OpenCohort[]>> {
  const listed = await observeRecords(view, { family: "cohort", kind: "cohort/document" });
  if (listed.status !== "known") return listed;
  const result: OpenCohort[] = [];
  for (const record of listed.value) {
    if (record.placement?.kind === "completed") continue;
    const parsed = parseCohortDocument(record.content);
    if (!parsed.success) return { status: "unavailable", condition: `${record.reference.owner.name}: ${parsed.error}` };
    result.push({ record, fields: parsed.data });
  }
  return { status: "known", value: result };
}
/** Enumerate open work-unit membership without treating unreadable fields as no membership.
 * @param view - Proposed store state.
 * @returns Every open membership or an actionable incomplete observation.
 */
export async function observeOpenMembers(view: StoreView): Promise<RuleObservation<readonly OpenMember[]>> {
  const listed = await observeRecords(view, { family: "work-item", kind: "work-item/meta" });
  if (listed.status !== "known") return listed;
  const result: OpenMember[] = [];
  for (const record of listed.value) {
    if (record.placement?.kind === "completed") continue;
    const parsed = ParsedMetaRecordSchema.safeParse(record.fields);
    if (!parsed.success) return { status: "unavailable", condition: `${record.reference.owner.name}: membership fields are unavailable.` };
    result.push({ record, cohort: parsed.data.cohort });
  }
  return { status: "known", value: result };
}
