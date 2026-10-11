/** Cohort rule cases with producer-decoded fields and complete logical views. */
import { ReadPlacementSchema } from "../../../src/lib/store/placement.js";
import { parseCohortDocument } from "../../../src/lib/store/kinds/cohort/parser.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import type { ReadPlacement, StoreRecord, WriteCheckInput } from "../../../src/lib/store/index.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { ruleRecord, ruleView } from "./rule-view.js";
export const COHORT_RULE_UID = "00000000-0000-4000-8000-000000000004";
export function cohortDoc(name = "group", parent: string | null = null, purpose: string | null = "Coordinate the work.", placement?: ReadPlacement): StoreRecord {
  const bytes = `# Cohort: \`${name}\`\n\n**Parent:** ${parent === null ? "[none]" : `\`${parent}\``}\n\n${purpose === null ? "" : `**Purpose:** ${purpose}\n`}\n---\n`;
  const parsed = parseCohortDocument(bytes);
  if (!parsed.success) throw new Error(parsed.error);
  const suffix = ["group", "child", "parent", "root", "other"].indexOf(name);
  if (suffix < 0) throw new Error("Unknown fixture cohort name.");
  const uid = name === "group" ? COHORT_RULE_UID : `00000000-0000-4000-8000-${String(40 + suffix).padStart(12, "0")}`;
  return ruleRecord("cohort/document", name, uid, bytes, parsed.data, placement);
}
export function cohortMember(cohort: string | null = "group", completed = false): StoreRecord {
  const bytes = makeMetaFixture("member", { owner: "andrew", workClass: "Light", priority: "P1", ...(cohort === null ? {} : { cohort }) });
  return ruleRecord("work-item/meta", "member", "00000000-0000-4000-8000-000000000007", bytes, parseMetaRecord(bytes), completed ? ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4", sequence: "01" }) : undefined);
}
export function cohortRuleInput(next: StoreRecord | null = cohortDoc(), prior: StoreRecord | null = null, after: readonly StoreRecord[] = [], before: readonly StoreRecord[] = []): WriteCheckInput {
  const reference = next?.reference ?? prior?.reference;
  if (reference === undefined) throw new Error("A cohort write needs a version.");
  return { reference, writer: { kind: "hand-edit" }, before: ruleView([...(prior === null ? [] : [prior]), ...before]),
    after: ruleView([...(next === null ? [] : [next]), ...after]),
    ...(prior === null ? {} : { prior: { content: prior.content, fields: prior.fields } }),
    ...(next === null ? {} : { next: { content: next.content, fields: next.fields } }) };
}
