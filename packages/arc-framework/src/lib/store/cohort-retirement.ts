/** Advisory retirement commands derived from fresh surviving cohort holdings. */
import { z } from "zod";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { OwnerIdentitySchema, recordReferences, sameOwner, type RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { Remedy } from "./refusal.js";
import { parseCohortDocument } from "./kinds/cohort/parser.js";
import { observeOpenHoldings, observeAllHoldings } from "./kinds/cohort/check-support.js";
import { observeNamedRecord } from "./kinds/rule-support.js";

/** An open cohort with no remaining open holder and a command that retires it. */
export interface EmptyCohortReport { reference: RecordReference; remedy: Remedy }
/** Incomplete observations remain advisory beside successfully established commands. */
export interface CohortRetirementReport { cohorts: EmptyCohortReport[]; notices: string[] }

/** Evaluate the retired source's former membership from the store after its batch lands. */
export async function reportEmptyCohorts(store: Store, source: StoreRecord): Promise<CohortRetirementReport> {
  const report: CohortRetirementReport = { cohorts: [], notices: [] };
  try {
    const path = sourcePath(source);
    if (path === null) return report;
    const targets: RecordReference[] = [];
    for (const segment of new Set(path.split("/"))) {
      const name = SlugSchema.parse(segment);
      const found = await observeNamedRecord(store, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })));
      if (found.status === "unavailable") throw new Error(found.condition);
      if (found.status === "absent") throw new Error(`Cohort ${name} is missing.`);
      const references = found.status === "known" ? [found.value.reference] : found.candidates;
      for (const reference of references) if (!targets.some(target => sameOwner(target.owner, reference.owner))) targets.push(reference);
    }
    for (const target of targets) await reportTarget(store, target, report);
  } catch (error) { report.notices.push(unavailableNotice(error)); }
  return report;
}

function sourcePath(source: StoreRecord): string | null {
  if (source.reference.kind === "work-item/meta") return ParsedMetaRecordSchema.parse(source.fields).cohort;
  const parsed = parseCohortDocument(source.content);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.data.parent;
}

async function reportTarget(store: Store, target: RecordReference, report: CohortRetirementReport): Promise<void> {
  try {
    const read = await store.read({ reference: target });
    if (read.status === "refused") throw new Error(read.refusal.condition);
    const primary = read.result;
    if (primary.placement?.kind === "completed") return;
    const open = await observeOpenHoldings(store, store, primary.reference);
    if (open.status !== "known") throw new Error(open.status === "unavailable" ? open.condition : "Open holdings are unavailable.");
    if (open.value.length > 0) return;
    const all = await observeAllHoldings(store, primary.reference);
    if (all.status !== "known") throw new Error(all.status === "unavailable" ? all.condition : "All-record holdings are unavailable.");
    const operation = all.value.length === 0 ? "remove" : "close", operand = await cohortOperand(store, primary.reference);
    report.cohorts.push({ reference: primary.reference, remedy: { text: `Cohort ${primary.reference.owner.name} has no open holders. Use arc cohort ${operation} ${operand}.`,
      argv: ["arc", "cohort", operation, operand] } });
  } catch (error) { report.notices.push(unavailableNotice(error)); }
}

async function cohortOperand(store: Store, reference: RecordReference): Promise<string> {
  const owner = reference.owner, lookup = await store.lookup({ kind: "slug", slug: owner.name });
  if (!z.uuid().safeParse(owner.name).success && lookup.status === "ok" && sameOwner(lookup.result.reference.owner, owner)) return owner.name;
  if (owner.type !== "person" && owner.uid !== undefined) return owner.uid;
  throw new Error(`Cohort ${owner.name} cannot be selected unambiguously.`);
}

function unavailableNotice(error: unknown): string {
  return `Cohort retirement could not be determined: ${error instanceof Error ? error.message : String(error)} Repair the reported evidence, then inspect the cohort before retiring it.`;
}
