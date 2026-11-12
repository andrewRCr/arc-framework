/** Metadata field-block and durable-value rules, scoped to the edit's changed facts. */
import { MetaRecordSchema, META_FIELD_KEYS } from "../../../active/meta-schema.js";
import { SlugSchema, WorkUnitStateSchema } from "../../../kernel/index.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { brokenRule } from "../rule-support.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";
import { bulletMarkerRe, inspectMetaPauseStructure } from "./line-reading.js";

function blockFacts(content: string): { anchor: string | null; counts: ReadonlyMap<string, number> } {
  const lines = content.split(/\r?\n/u);
  const h1 = lines.findIndex((line) => /^# /u.test(line));
  const closing = lines.findIndex((line, index) => index > h1 && line.trim() === "---");
  const section = lines.findIndex((line, index) => index > h1 && /^## /u.test(line));
  const end = Math.min(closing < 0 ? lines.length : closing, section < 0 ? lines.length : section);
  const block = h1 < 0 ? [] : lines.slice(h1 + 1, end);
  return { anchor: h1 < 0 ? "missing metadata H1 heading" : closing < 0 ? "missing closing metadata delimiter" : null,
    counts: new Map(["State", "Design", "Cohort"].map((name) => [name, block.filter((line) => bulletMarkerRe(name).test(line)).length])) };
}

/** Validate new field-block defects and changed State evidence.
 * @param input - Proposed metadata write.
 * @returns The field-block violation, if any.
 */
export function checkMetaFieldBlock(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.next === undefined) return [];
  const versions = metaFieldVersions(input);
  const next = blockFacts(input.next.content);
  const prior = versions.prior === undefined ? undefined : blockFacts(input.prior?.content ?? "");
  const problems = blockProblems(next, prior);
  if (invalidChangedState(versions)) problems.push("State is unset or invalid");
  return problems.length === 0 ? [] : [brokenRule("meta.field-block", problems.join("; "),
    "Restore the metadata H1, closing standalone ---, valid State, one Design bullet, and at most one State or Cohort bullet, then retry.")];
}

function invalidChangedState(versions: import("./check-support.js").MetaFieldVersions): boolean {
  return (versions.prior === undefined || metaFieldChanged(versions, "state"))
    && !WorkUnitStateSchema.safeParse(versions.next?.state).success;
}

function blockProblems(next: ReturnType<typeof blockFacts>, prior: ReturnType<typeof blockFacts> | undefined): string[] {
  const problems: string[] = [];
  if (next.anchor !== null && next.anchor !== prior?.anchor) problems.push(next.anchor);
  if (next.counts.get("Design") === 0 && prior?.counts.get("Design") !== 0) problems.push("missing Design line in the field block");
  for (const name of ["State", "Design", "Cohort"]) {
    const count = next.counts.get(name) ?? 0;
    if (count > 1 && count !== prior?.counts.get(name)) problems.push(`multiple ${name} bullets in the field block`);
  }
  return problems;
}

/** Validate new or changed durable field values without rejecting unchanged legacy values.
 * @param input - Proposed metadata write.
 * @returns The durable-field violation, if any.
 */
export function checkMetaDurableFields(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.next === undefined) return [];
  const versions = metaFieldVersions(input);
  const next = versions.next;
  const rule = "meta.durable-fields";
  const remedy = "Set each changed field to a durable value and Owner to an identity slug, then retry.";
  const pauseDefects = inspectMetaPauseStructure(input.next.content);
  if (pauseDefects.length > 0) return [brokenRule(rule, pauseDefects.join("; "),
    "Use arc pause to replace the malformed section or arc resume to clear it, then retry.")];
  if (next === undefined) return [brokenRule(rule, "The proposed metadata fields cannot be read.", remedy)];
  const fields = MetaRecordSchema.keyof().options.filter((key) => key !== "state"
    && (versions.prior === undefined || metaFieldChanged(versions, key)));
  const invalid = fields.filter((key) => !MetaRecordSchema.shape[key].safeParse(next[key]).success
    || (key === "owner" && !SlugSchema.safeParse(next.owner).success));
  const labels = invalid.map((key) => META_FIELD_KEYS.find((field) => field.key === key)?.name ?? key);
  return invalid.length === 0 ? [] : [brokenRule(rule, `Invalid durable fields: ${labels.join(", ")}.`, remedy)];
}
