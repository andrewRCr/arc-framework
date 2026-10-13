/** Metadata write inputs produced by the real renderer and tolerant parser. */
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../meta-fixture.js";
import type { WriteCheckInput } from "../../../src/lib/store/write-check.js";
import { ruleRecord, ruleView } from "./rule-view.js";

/** Stable fixture generation used by every metadata rule case. */
export const META_RULE_UID = "00000000-0000-4000-8000-000000000001";
/** Canonical, durable and lifecycle-consistent metadata bytes. */
export const META_RULE_CONTENT = makeMetaFixture("example", {
  owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", design: ["spec-example.md"],
});

/** Construct the bytes, parsed fields, identity and both views of a meta edit.
 * @param nextContent - Result bytes, or null for removal.
 * @param priorContent - Stored bytes, or null for creation; malformed stored bytes carry no fields.
 * @param writer - Hand edit by default, or the producing verb.
 * @returns A faithful check input.
 */
export function metaRuleInput(nextContent: string | null = META_RULE_CONTENT, priorContent: string | null = META_RULE_CONTENT,
  writer: WriteCheckInput["writer"] = { kind: "hand-edit" }): WriteCheckInput {
  let priorFields: unknown;
  if (priorContent !== null) {
    try { priorFields = parseMetaRecord(priorContent); } catch { priorFields = undefined; }
  }
  const prior = priorContent === null ? undefined
    : ruleRecord("work-item/meta", "example", META_RULE_UID, priorContent, priorFields);
  const next = nextContent === null ? undefined
    : ruleRecord("work-item/meta", "example", META_RULE_UID, nextContent, parseMetaRecord(nextContent));
  const reference = next?.reference ?? prior?.reference;
  if (reference === undefined) throw new Error("A rule input needs a prior or next record.");
  return { reference, writer, before: ruleView(prior === undefined ? [] : [prior]), after: ruleView(next === undefined ? [] : [next]),
    ...(prior === undefined ? {} : { prior: { content: prior.content, ...(prior.fields === undefined ? {} : { fields: prior.fields }) } }),
    ...(next === undefined ? {} : { next: { content: next.content, fields: next.fields } }),
  };
}
